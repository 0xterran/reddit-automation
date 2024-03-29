// $ node src/workflows/subreddits-follow.js
const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const axios = require("axios");
const chromium = require("@sparticuz/chromium");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  retrieveFromAirtable,
  saveCookiesToAirtable,
} = require("../api/airtable");
const { loggingWebhook } = require("../api/logging");

const gemini_api_key = "AIzaSyA5583wx8Oc2UDCvvRPEBFS6AWjmGLadI4";

// Access your API key as an environment variable (see "Set up your API key" above)
const genAI = new GoogleGenerativeAI(gemini_api_key);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Add stealth plugin and use defaults
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const { scrollPageToBottom } = require("puppeteer-autoscroll-down");
const { createCursor } = require("ghost-cursor");

// Use stealth
puppeteer.use(StealthPlugin());

// Configure the plugin with a CAPTCHA-solving service provider (e.g., 2Captcha)
puppeteer.use(
  RecaptchaPlugin({
    provider: { id: "2captcha", token: "5de38fa66044c2bb1a6b458d1d94c19f" },
  })
);

const run = async ({ isCloud, inputArgs }) => {
  const profile = await retrieveFromAirtable({ recordID: inputArgs.recordID });
  const [proxyServer, proxyPort, proxyUsername, proxyPassword] =
    profile.proxy.split(":");
  const profileCookies = profile.cookies;
  const p = new Promise(async (res, rej) => {
    // Launch pupputeer-stealth
    const config = {
      headless: isCloud,
      devtools: false,
      args: [
        `--proxy-server=${proxyServer}:${proxyPort}`,
        `--proxy-auth=${proxyUsername}:${proxyPassword}`,
      ],
    };
    if (isCloud) {
      config.defaultViewport = chromium.defaultViewport;
      config.executablePath = await chromium.executablePath();
      config.args = chromium.args;
    }
    puppeteer.launch(config).then(async (browser) => {
      // Create a new page
      const page = await browser.newPage();
      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword,
      });

      const urls = inputArgs.urls;
      // allow clipboard access
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(urls[0], [
        "clipboard-read",
        "clipboard-write",
      ]);
      // use ghost cursor
      const cursor = createCursor(page);
      await page.setViewport({ width: 1280, height: 720 });
      await page.waitForTimeout(1000);
      // begin the workflow
      let threadsLurked = 0;
      const getRandomInt = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      };
      // load cookies

      let alreadyLoggedIn = false;
      const setupCookies = async () => {
        if (profileCookies && profileCookies.length > 0) {
          console.log("Loaded cookies: ", profileCookies.length, " found");
          await page.setCookie(...profileCookies);
          alreadyLoggedIn = profileCookies.some(
            (cookie) => cookie.name === "reddit_session"
          );
        } else {
          console.log("Cookies empty");
        }
      };
      await setupCookies();
      // login if needed
      const loginFlow = async () => {
        await cursor.click("a#login-button");
        await page.waitForTimeout(1000);

        // Types slower, like a user
        await page.type("#login-username", profile.username, {
          delay: 100,
        });
        await page.type("#login-password", profile.password, {
          delay: 250,
        });
        await page.waitForTimeout(500);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(10000);
      };
      if (!alreadyLoggedIn) {
        await loginFlow();
      }
      // begin workflow
      const followSubreddit = async (url) => {
        // Go to the website
        await page.goto(url);
        await page.waitForTimeout(2000);
        const buttonXPath =
          "//button[contains(text(), 'Join')][@role='button']";
        await page.waitForXPath(buttonXPath);
        const joinButtons = await page.$x(buttonXPath);

        for (let joinButton of joinButtons) {
          const buttonText = await joinButton.evaluate((el) => el.textContent);
          console.log("Button text:", buttonText);
        }
        joinButtons[0].click();
        const page_url = page.url();
        const logPayload = {
          username: profile.username,
          action: "follow_subreddit",
          url: page_url,
          timestamp: new Date().toISOString(),
        };
        try {
          await axios.post(loggingWebhook, logPayload);
        } catch (error) {
          console.error("Error sending log:", error);
        }
        await page.waitForTimeout(1000);
      };
      const runSequentially = async (urls) => {
        for (let url of urls) {
          await followSubreddit(url);
        }
      };
      await runSequentially(urls);

      const updateCookies = async () => {
        await page.waitForTimeout(2000);
        const updatedCookies = await page.cookies();
        await saveCookiesToAirtable({
          recordID: inputArgs.recordID,
          cookiesArray: updatedCookies,
        });
      };
      await updateCookies();
      await browser.close();
      res();
    });
  });
  return p;
};
// run locally
// run({
//   isCloud: false,
//   inputArgs: {
//     recordID: "recl9EyGvU4ASC1V0",
//     urls: [
//       "https://www.reddit.com/r/webdev/",
//       "https://www.reddit.com/r/everymanshouldknow/",
//     ],
//   },
// });

// run in the cloud
exports.handler = async (event) => {
  console.log(`Starting subreddits-follow.js workflow`);

  // Parse the JSON body from the event
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON" }),
    };
  }
  // Access the arguments
  const inputArgs = {
    recordID: body.recordID || "",
    urls: [
      "https://www.reddit.com/r/webdev/",
      "https://www.reddit.com/r/everymanshouldknow/",
    ],
  };
  if (!inputArgs.recordID) {
    console.log(`No Airtable recordID found, aborting...`);
    return;
  }

  await run({ isCloud: true, inputArgs });
};
