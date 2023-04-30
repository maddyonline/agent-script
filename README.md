# Setup

Create a `.env` file with env variable `OPENAI_API_KEY=` set to OpenAI key. Install dependencies by running `npm install`. 

To run in local mock api mode (which doesn't make any calls to OpenAI), run `npm run start`.

To run in actual model (calling OpenAI), run `npm run start-actual`.


The agent state machine roughly looks like the following.

<img width="1017" alt="Screenshot 2023-04-29 at 11 16 16 PM" src="https://user-images.githubusercontent.com/6402895/235338783-4c9bc549-2fd6-43b1-bcb5-ad289f639fcb.png">
