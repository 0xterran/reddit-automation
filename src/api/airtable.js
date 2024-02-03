const axios = require("axios");

async function retrieveFromAirtable({ recordID }) {
  try {
    const url =
      "https://app.legions.bot/webhook/02fc08e1-60bc-4a8a-b405-b6b0b592c04d";
    const postData = {
      recordID,
    };
    const response = await axios.post(url, postData);
    const responseData = response.data;
    console.log("Response Data:", responseData);
    /**
     * responseData = {
        recordID: string;
        username: string;
        password: string;
        proxy: string;
        cookies: string;
      }
     */
    return responseData;
  } catch (error) {
    console.error("Error making POST request:", error);
  }
}

async function saveCookiesToAirtable({ recordID, cookiesArray }) {
  const cookiesString = JSON.stringify(cookiesArray);
  try {
    const url =
      "https://app.legions.bot/webhook/e60fec3f-81d0-4aa2-892f-a8a5b7c82f38";
    const postData = {
      recordID,
      cookiesString,
    };
    const response = await axios.post(url, postData);
    const responseData = response.data;
    console.log("Response Data:", responseData);
    /**
     * responseData = {
        recordID: string;
        username: string;
        password: string;
        proxy: string;
        cookies: string;
      }
     */
    return responseData;
  } catch (error) {
    console.error("Error making POST request:", error);
  }
}

module.exports = {
  retrieveFromAirtable,
  saveCookiesToAirtable,
};
