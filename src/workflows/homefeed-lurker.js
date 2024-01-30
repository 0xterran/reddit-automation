// $ node src/workflows/homefeed-lurker.js
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
puppeteer.launch({ headless: false, devtools: true }).then(async (browser) => {
  // Create a new page
  const page = await browser.newPage();
  const url = "https://www.reddit.com";
  // allow clipboard access
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(url, ["clipboard-read", "clipboard-write"]);
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
  await page.evaluate(
    ({ links }) => {
      console.log("links", links);
    },
    { links }
  );
  console.log(links);
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
      .$$eval('div[data-test-id="post-content"] .RichTextJSON-root p', (ps) =>
        ps.length > 0 ? ps.map((p) => p.textContent) : [""]
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

  const updateCookies = async () => {
    await page.waitForTimeout(2000);
    const updatedCookies = await page.cookies();
    fs.writeFileSync(cookieFilesPath, JSON.stringify(updatedCookies, null, 2));
  };
  await updateCookies();
  await browser.close();
});
