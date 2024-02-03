// $ node src/workflows/homefeed-lurker.js --recordID=RECORD_ID
const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const axios = require("axios");
const chromium = require("@sparticuz/chromium");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

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

function matchesSubRedditPattern(href) {
  const pattern = /\/r\/[^\/]+\/comments\/[^\/]+/;
  const match = pattern.test(href);
  console.log(`Found match = ${match} for ${href}`);
  return match;
}

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
      // Go to the website
      await page.goto(url, { timeout: 60000 });
      await page.waitForTimeout(2000);
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
        const updateCookies = async () => {
          await page.waitForTimeout(2000);
          const updatedCookies = await page.cookies();
          await saveCookiesToAirtable({
            recordID: inputArgs.recordID,
            cookiesArray: updatedCookies,
          });
        };
        await updateCookies();
      };
      if (!alreadyLoggedIn) {
        await loginFlow();
      }
      // begin homefeed lurking
      const scrollDownALittle = async (pixels = 100) => {
        await page.evaluate(
          ({ pixels }) => {
            window.scrollBy(0, pixels); // Scrolls down 100 pixels
          },
          { pixels }
        );
        await page.waitForTimeout(1000);
      };
      await scrollDownALittle(100);
      await scrollDownALittle(100);

      const totalLurkedPages = getRandomInt(1, 5);
      let lurkedPagesCount = 0;
      let browsedUntilIndex = 0;
      await page.waitForSelector(`div[data-scroller-first]`);
      const links = await page.$$(`div[data-scroller-first] ~ div`);

      const lurkPost = async (nextLink) => {
        await cursor.click(nextLink);
        await page.waitForTimeout(2000);
        const scrollDownALittle = async (pixels = 100) => {
          await page.evaluate(
            ({ pixels }) => {
              window.scrollBy(0, pixels); // Scrolls down 100 pixels
            },
            { pixels }
          );
          await page.waitForTimeout(1000);
        };
        await scrollDownALittle(100);
        await scrollDownALittle(100);
        // Extract the title text
        const title = await page
          .$eval(
            'div[data-test-id="post-content"] h1',
            (h1) => (h1 ? h1.textContent : ""),
            "" // Default to empty string if the element is not found
          )
          .catch(() => ""); // Using .catch to handle the case where the element is not found
        // Extract the paragraph texts
        const paragraphs = await page
          .$$eval(
            'div[data-test-id="post-content"] .RichTextJSON-root p',
            (ps) => (ps.length > 0 ? ps.map((p) => p.textContent) : [""])
          )
          .catch(() => []); // If no paragraphs are found, return an empty array
        console.log("Title:", title);
        console.log("Paragraphs:", paragraphs);
        const lurk = async () => {
          await scrollDownALittle(getRandomInt(50, 300));
          await page.waitForTimeout(getRandomInt(1000, 4000));
        };
        const lurkScrolls = getRandomInt(1, 5);
        let lurkCount = 0;
        while (lurkCount < lurkScrolls) {
          await lurk();
          lurkCount++;
        }
        await page.waitForTimeout(1000);
        const page_url = page.url();
        const logPayload = {
          username: profile.username,
          action: "lurk_page",
          url: page_url,
          title,
          timestamp: new Date().toISOString(),
        };
        try {
          await axios.post(loggingWebhook, logPayload);
        } catch (error) {
          console.error("Error sending log:", error);
        }
        await page.goBack();
      };
      // scroll the homefeed
      const step = getRandomInt(1, 3);
      while (
        lurkedPagesCount < totalLurkedPages &&
        browsedUntilIndex + step < links.length
      ) {
        const scrollAmount = 100 * step;
        await scrollDownALittle(scrollAmount / 2);
        await scrollDownALittle(scrollAmount / 2);
        browsedUntilIndex += step;
        console.log(`browsedUntilIndex = ${browsedUntilIndex}`);
        nextLink = links[browsedUntilIndex];
        console.log(nextLink);
        const checkIfValidLink = async (link) => {
          const href = await page.evaluate((el) => el.href, link);
          if (matchesSubRedditPattern(href)) {
            return true;
          }
          return false;
        };
        // const isValidLink = await checkIfValidLink(nextLink);
        // if (isValidLink) {
        //   // lurk the post
        // }
        await lurkPost(nextLink);
        lurkedPagesCount++;
      }

      await browser.close();
      res();
    });
  });
  return p;
};

// run locally
const runLocally = async () => {
  const argv = yargs(hideBin(process.argv)).option("recordID", {
    alias: "r",
    describe: "The ID of the record",
    type: "string",
    demandOption: true, // This makes it required
  }).argv;
  console.log("Record ID:", argv.recordID);
  await run({
    isCloud: false,
    inputArgs: {
      recordID: argv.recordID,
    },
  });
};
runLocally();

// run in the cloud
exports.handler = async (event) => {
  console.log(`Starting homefeed-lurker.js workflow`);

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
