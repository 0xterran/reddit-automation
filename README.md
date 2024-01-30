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

## Feature ToDo

Prioritized order matters. Accounts might get shadowbanned so test batches first to see if we can even get that far. Don't code features if we won't be able to use them.

1. [x] Ability to auto-lurk, browsing through Reddit into a random post and scroll through comments, then continue browsing
2. [x] Ability to comment on a random post from homefeed
3. [x] Ability to comment on a specific post
4. [x] Ability to follow a list of subreddits
5. [x] Migrate script to AWS Lambda with input args so that we can automate this for many accounts
6. [ ] Fix the lambdas to get the args passed in from POST request
7. [ ] Log the IP address used in each workflow
8. [ ] Orchestrate the warmup
9. [ ] Ability to set a subreddit to scroll in instead of the homepage
10. [ ] Ability to upvote downvote
11. [ ] Ability to post to Reddit
12. [ ] Ability to respond to comment replies

## Testing Process

1. Batch 10 new Reddit accounts created from SproutSocial
2. Run the lurker script on all 10 accounts on Day 1
3. Run the subreddit follow script on all 10 accounts on Day 1
3. Run the comment script on all 10 accounts on Day 2, commenting on r/NewToReddit
4. Run the check if shadowbanned script from APIfy
5. Run the lurker script on all 10 accounts for 3 days (Day 3-5)
6. Run the check if shadowbanned script from APIfy
7. Run the homefeed comment script on all 10 accounts on Day 6, commenting on random posts
8. Run the check if shadowbanned script from APIfy
9. Run the homefeed comment script on all 10 accounts for 3 days (Day 7-9), commenting on random posts. Also run the shadowban script each day.
10. Run the check if shadowbanned script from APIfy on Day 10

Observe the days of success vs failure. If we have a high success rate, we can move on to the next feature. If we have a high failure rate, we need to debug and fix the script before moving on to the next feature.