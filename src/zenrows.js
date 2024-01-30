// npm install axios
const axios = require("axios");

const url = "https://www.g2.com/products/asana/reviews";
const apikey = "7adf12896a0f712f9d0e844a2c52ee5b04e1ffbc";
axios({
  url: "https://api.zenrows.com/v1/",
  method: "GET",
  params: {
    url: url,
    apikey: apikey,
    js_render: "true",
    premium_proxy: "true",
    return_screenshot: "true",
  },
})
  .then((response) => console.log(response.data))
  .catch((error) => console.log(error));
