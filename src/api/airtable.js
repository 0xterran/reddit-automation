async function retrieveFromAirtable({ recordID }) {
  try {
    const url = "https://eoa61wmdwrqdqr8.m.pipedream.net";
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
    const url = "https://eo2ntnugkt4dwlj.m.pipedream.net";
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
