// visit this page in browser
// https://www.reddit.com/r/iqtest/comments/1adsvat/comment/kk7vbcd/?utm_source=share&utm_medium=web2x&context=3

const comments = Array.from(document.querySelectorAll("div.Comment"));
const targetUsername = "swiftDarthVader1992"; // Example username

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
          document.querySelectorAll(
            'button[role="menuitem"]._10K5i7NW6qcm-UoCtpB3aK'
          )
        );
        const copyLinkButton = copyLinkButtonCandidates.find((button) =>
          Array.from(button.querySelectorAll("span")).some(
            (span) => span.textContent === "Copy link"
          )
        );

        if (copyLinkButton) {
          console.log('Found "Copy Link" button:', copyLinkButton);
          copyLinkButton.click();
        } else {
          console.log('No "Copy Link" button found.');
        }
      }, 1000); // Wait for 1 second for the "Copy Link" button to become visible after clicking "Share"
      break; // Exit the loop since the target share button has been interacted with
    }
  }
}
