// $ node src/workflows/homefeed-commenter.js
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
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

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
      // const url =
      //   "https://www.reddit.com/r/iqtest/comments/1adsvat/can_you_solve_this_lmk/";
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

      const toggleJSConsole = async () => {
        // Try to send a keyboard shortcut to switch to the Console tab
        // This is experimental and may not work reliably
        await page.keyboard.down("Control");
        await page.keyboard.down("Shift");
        await page.keyboard.press("J"); // Or 'I' for Mac
        await page.keyboard.up("Shift");
        await page.keyboard.up("Control");
      };
      await toggleJSConsole();

      // Go to the website
      await page.goto(url, { timeout: 60000 });

      await page.waitForTimeout(3000);

      // const lastPosition = await scrollPageToBottom(page, {
      //   size: 10,
      //   delay: 250,
      // });
      // console.log(lastPosition);
      // await page.waitForTimeout(1000);

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

      const readAndClickRedditFeed = async () => {
        let nth = 3; // Starting at the 3rd div
        let validLinkFound = false;
        const maxRetries = 10; // Set a maximum number of retries to avoid an infinite loop

        while (!validLinkFound && nth - 3 < maxRetries) {
          // Wait for and select all <a> elements within the current nth div
          await page.waitForSelector(
            `div[data-scroller-first] ~ div:nth-of-type(${nth}) a`
          );
          const links = await page.$$(
            `div[data-scroller-first] ~ div:nth-of-type(${nth}) a`
          );

          // Log the count of links found in the current nth div
          console.log(`Links in nth-of-type(${nth}):`, links.length);

          // Iterate through each link to check if it matches the subReddit pattern
          for (const link of links) {
            const href = await page.evaluate((el) => el.href, link);
            if (matchesSubRedditPattern(href)) {
              console.log("Let's click this link:", href);
              await cursor.click(link); // Triggers the navigation
              // await link.click();
              validLinkFound = true;
              break; // Break the for-loop as a valid link is found
            }
          }

          if (!validLinkFound) {
            console.log(
              `No valid link found in nth-of-type(${nth}). Trying the next div...`
            );
            nth++; // Increment nth value to check the next div
            await scrollDownALittle(100);
          }
        }

        if (!validLinkFound) {
          console.log("No valid links found after maximum retries.");
        }

        await page.waitForTimeout(5000); // Wait for potential navigation or UI update
      };
      // Call the function
      await readAndClickRedditFeed();

      const readScrollCommentPost = async () => {
        await page.waitForTimeout(3000);
        await scrollDownALittle(100);
        await scrollDownALittle(100);
        await scrollDownALittle(100);
        await scrollDownALittle(-300);

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
          console.log(
            "Generated comment was blocked due to safety. Exiting..."
          );
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
        // Wait for the submit button to be available
        // const commentButtonSelector = 'button[type="submit"]';
        // await page.waitForSelector(commentButtonSelector);
        // await cursor.click(commentButtonSelector);

        // XPath expression to find the button
        const buttonXPath =
          "//button[contains(text(), 'Comment')][@type='submit']";
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

            const comments = Array.from(
              document.querySelectorAll("div.Comment")
            );

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
                    const copyLinkButton = copyLinkButtonCandidates.find(
                      (button) =>
                        Array.from(button.querySelectorAll("span")).some(
                          (span) => span.textContent === "Copy link"
                        )
                    );

                    if (copyLinkButton) {
                      console.log('Found "Copy Link" button:', copyLinkButton);
                      copyLinkButton.click();
                      setTimeout(async () => {
                        const clipboardText =
                          await navigator.clipboard.readText();
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
        return { permalink, generatedComment, title };
      };
      const { permalink, generatedComment, title } =
        await readScrollCommentPost();

      console.log(
        `Commented! Heres the permalink to the comment: ${permalink}`
      );

      const logPayload = {
        username: profile.username,
        action: "comment_post",
        comment: generatedComment,
        permalink: permalink,
        title,
        timestamp: new Date().toISOString(),
      };

      try {
        await axios.post(loggingWebhook, logPayload);
      } catch (error) {
        console.error("Error sending log:", error);
      }

      // Wait for security check
      await page.waitForTimeout(2000);
      await page.goBack();

      // Evaluate script in the context of the page
      // Outputs to browser js console
      await page.evaluate(() => {
        console.log("This message is logged to the Chrome JavaScript Console");
      });

      // Wait for security check
      await page.waitForTimeout(5000);

      // // Solve reCAPTCHA challenges on the page
      // const recaptchaSolutions = await page.solveRecaptchas();
      // console.log(recaptchaSolutions);

      // Navigate to a sample website
      // await page.goto("https://www.g2.com/products/asana/reviews");

      // await page.screenshot({ path: "asana-recaptcha.png", fullPage: true });

      // // Get title text
      // title = await page.evaluate(() => {
      //   return document.querySelector(
      //     "body > div.nonhystericalbg > div > header > div > h3"
      //   ).textContent;
      // });

      // // Get message text
      // msg = await page.evaluate(() => {
      //   return document.querySelector(
      //     "body > div.nonhystericalbg > div > main > h1"
      //   ).textContent;
      // });

      // // get state text
      // state = await page.evaluate(() => {
      //   return document.querySelector(
      //     "body > div.nonhystericalbg > div > main > p:nth-child(2)"
      //   ).textContent;
      // });

      // // print out the results
      // console.log(title, "\n", msg, "\n", state);

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
  run({
    isCloud: false,
    inputArgs: {
      recordID: argv.recordID,
    },
  });
};
runLocally();

// run in the cloud
exports.handler = async (event) => {
  console.log(`Starting homefeed-commenter.js workflow`);

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
