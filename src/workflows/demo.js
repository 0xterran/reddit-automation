// $ node src/workflows/demo.js
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
  console.log("typeof profile.cookies", typeof profile.cookies);
  const profileCookies = profile.cookies;
  const p = new Promise(async (res, rej) => {
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
    // Launch pupputeer-stealth
    puppeteer.launch(config).then(async (browser) => {
      // Create a new page
      const page = await browser.newPage();

      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword,
      });

      const url = "https://www.reddit.com";
      // allow clipboard access
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(url, [
        "clipboard-read",
        "clipboard-write",
      ]);
      // use ghost cursor
      const cursor = createCursor(page);
      await page.setViewport({ width: 1280, height: 720 });
      await page.waitForTimeout(1000);
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
      // Go to the website
      await page.goto(url);
      await page.waitForTimeout(5000);

      // log it
      console.log(`Logging this event... ${loggingWebhook}`);
      const page_url = page.url();
      const logPayload = {
        username: profile.username,
        action: "demo_puppeteer",
        url: page_url,
        timestamp: new Date().toISOString(),
      };
      try {
        await axios.post(loggingWebhook, logPayload);
      } catch (error) {
        console.error("Error sending log:", error);
      }

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
//     recordID: "recDpl9Jwzc9jIzga",
//   },
// });

// run in the cloud
exports.handler = async (event) => {
  console.log(`Starting demo.js workflow`);
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
  };
  if (!inputArgs.recordID) {
    console.log(`No Airtable recordID found, aborting...`);
    return;
  }
  await run({ isCloud: true, inputArgs });
};
