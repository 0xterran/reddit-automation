// $ node src/workflows/demo.js
const puppeteer = require("puppeteer-extra");
const fs = require("fs");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const gemini_api_key = "AIzaSyA5583wx8Oc2UDCvvRPEBFS6AWjmGLadI4";

// Access your API key as an environment variable (see "Set up your API key" above)
const genAI = new GoogleGenerativeAI(gemini_api_key);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Add stealth plugin and use defaults
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
const { scrollPageToBottom } = require("puppeteer-autoscroll-down");
const { createCursor } = require("ghost-cursor");

const loggingWebhook = "https://eonm736j22q5lgz.m.pipedream.net";

const profile = {
  name: "Sarah Van Robin",
  backstory: `
Grew up: Los Angeles, California
School: University of California, Berkeley
Studied: Computer Science
Currently Lives: San Francisco, California
Hobbies: Surfing and podcasting
Marital Status: Single
Social Justice Cause: Environmental conservation
Pet Peeves: Unpunctuality and inefficiency
Myers-Briggs: ENTP
Birthday: March 12
Main Job: Software Engineer at a tech startup
Side Gig: Zapier Consultant
  `,
  username: "frontorange94",
  password: "TwtbUFVp6PPCpbi",
  proxy: {
    server: "portal-na.anyip.io",
    port: "1080",
    username:
      "user_bafb00,type_residential,country_US,lat_31.968599,lon_-99.901813,session_23b147e1",
    password: "password",
  },
};

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

// Launch pupputeer-stealth
puppeteer
  .launch({
    headless: false,
    devtools: true,
    args: [
      `--proxy-server=${profile.proxy.server}:${profile.proxy.port}`,
      `--proxy-auth=${profile.proxy.username}:${profile.proxy.password}`,
    ],
  })
  .then(async (browser) => {
    // Create a new page
    const page = await browser.newPage();

    await page.authenticate({
      username: profile.proxy.username,
      password: profile.proxy.password,
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
    const cookieFilesPath = `src/profiles/P001/cookies-P001.json`;
    let alreadyLoggedIn = false;
    const setupCookies = async () => {
      if (fs.existsSync(cookieFilesPath)) {
        const cookies = JSON.parse(fs.readFileSync(cookieFilesPath, "utf-8"));
        await page.setCookie(...cookies);
        console.log("Loaded cookies: ", cookies.length, " found");
        alreadyLoggedIn = cookies.some(
          (cookie) => cookie.name === "reddit_session"
        );
      } else {
        console.log("Cookie file does not exist:", cookieFilesPath);
      }
    };
    await setupCookies();
    // Go to the website
    await page.goto(url);
    await page.waitForTimeout(60000);

    const updateCookies = async () => {
      await page.waitForTimeout(2000);
      const updatedCookies = await page.cookies();
      fs.writeFileSync(
        cookieFilesPath,
        JSON.stringify(updatedCookies, null, 2)
      );
    };
    await updateCookies();
    // await browser.close();
  });
