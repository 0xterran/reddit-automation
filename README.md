# Reddit Automation

This puppeteer script will:
1. Login into Reddit
2. Browse the homefeed
3. Click into a random post
4. Write a personalized comment
5. Log the comment permalink to webhook

Session cookies are saved locally. User profiles are loaded locally.

## Run the script

```bash
$ npm install
$ npm run start
```

## Limitations

- If Reddit throws an error about how you are commenting too often, the scripit will fail and abort Chromium