// $ node src/workflows/post-commenter.js
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
  const url =
    "https://www.reddit.com/r/InstagramMarketing/comments/1ae635m/anyone_experiencing_very_poor_engagementviews/";
  // allow clipboard access
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(url, ["clipboard-read", "clipboard-write"]);
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
  // begin the workflow
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

  // Post a comment
  const postComment = async () => {
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

    const user_style_prompt =
      "Write a reddit comment that responds to the post casually without sounding like a bot, and with redditor energy/personality. Even a bit of criticism is good but not all the time. Try not to talk about them too much, talk more about yourself almost like on a high horse. Keep it relatively short under 20 words.";
    const prompt = `
      You are a commentator on reddit posts.
      Write a single comment/reply for the given post.
      You will also get a user defined style prompt, for you to write your single comment/reply in their desired style. Please adjust to the users preference.
      
      Here is the users style prompt: 
      -- start of user style prompt --
      ${user_style_prompt}
      -- end of user style prompt --
  
      Please provide only your best one option for comment/reply. 
      Feel free to comply with your safety alignment or requirements.
      You do NOT need to provide real-time or current news updates or verify the content of the image. Just generate a single response.
      Straightforward answer without any additional embellishments or explanations.
  
      Here is the post information:
      Title: ${title}
      Post: ${paragraphs.join("\n")}
      `;
    console.log(prompt);
    console.log("------------------");
    let generatedComment = "";
    try {
      const result = await model.generateContent([prompt]);
      const response = await result.response;
      generatedComment = response.text();
    } catch (e) {
      console.log(e);
      console.log(e.message);
      generatedComment = "Blocked due to safety";
    }
    console.log("Generated comment:", generatedComment);
    if (generatedComment === "Blocked due to safety") {
      console.log("Generated comment was blocked due to safety. Exiting...");
      throw new Error("Generated comment was blocked due to safety.");
    }

    // Get the text input
    const inputTextSelector =
      'div[data-test-id="comment-submission-form-richtext"] div[contenteditable="true"]';
    await page.waitForSelector(inputTextSelector);
    await cursor.click(inputTextSelector);
    await page.type(
      'div[data-test-id="comment-submission-form-richtext"] div[contenteditable="true"]',
      generatedComment,
      { delay: 250 }
    );

    await page.waitForTimeout(1000);
    // XPath expression to find the button
    const buttonXPath = "//button[contains(text(), 'Comment')][@type='submit']";
    await page.waitForXPath(buttonXPath);
    const commentButtons = await page.$x(buttonXPath);

    if (commentButtons.length > 0) {
      const commentButton = commentButtons[0];
      await commentButton.click();
    } else {
      // Handle the case where the button is not found
      console.log("Comment button not found");
    }

    await page.waitForTimeout(3000);

    // Get the posted comment's permalink
    const permalink = await page.evaluate((targetUsername) => {
      return new Promise((resolve, reject) => {
        let permalinkUrl = "";

        const comments = Array.from(document.querySelectorAll("div.Comment"));

        for (const comment of comments) {
          const usernameLink = comment.querySelector(
            `a[href*="/user/${targetUsername}/"]`
          );
          if (usernameLink) {
            const buttons = comment.querySelectorAll("button");
            const shareButton = Array.from(buttons).find((button) =>
              button.textContent.includes("Share")
            );

            if (shareButton) {
              console.log('Found "Share" button:', shareButton);
              shareButton.click();

              setTimeout(() => {
                // Use the class and role to narrow down the "Copy Link" button and verify its text content
                const copyLinkButtonCandidates = Array.from(
                  document.querySelectorAll('button[role="menuitem"]')
                );
                const copyLinkButton = copyLinkButtonCandidates.find((button) =>
                  Array.from(button.querySelectorAll("span")).some(
                    (span) => span.textContent === "Copy link"
                  )
                );

                if (copyLinkButton) {
                  console.log('Found "Copy Link" button:', copyLinkButton);
                  copyLinkButton.click();
                  setTimeout(async () => {
                    const clipboardText = await navigator.clipboard.readText();
                    console.log("clipboardText:", clipboardText);
                    permalinkUrl = clipboardText;
                    resolve(permalinkUrl);
                  }, 1000);
                } else {
                  console.log('No "Copy Link" button found.');
                }
              }, 1000); // Wait for 1 second for the "Copy Link" button to become visible after clicking "Share"
              break; // Exit the loop since the target share button has been interacted with
            }
          }
        }
      });
    }, profile.username);
    return { permalink, generatedComment };
  };
  const { permalink, generatedComment } = await postComment();

  console.log(`Commented! Heres the permalink to the comment: ${permalink}`);

  const logPayload = {
    username: profile.username,
    action: "comment_post",
    comment: generatedComment,
    permalink: permalink,
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
    fs.writeFileSync(cookieFilesPath, JSON.stringify(updatedCookies, null, 2));
  };
  await updateCookies();
  await browser.close();
});
