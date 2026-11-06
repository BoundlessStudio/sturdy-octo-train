# Scrollworks

Type a website idea and scroll down to send it. Scrollworks shows one step at a time: each scroll reads an update, adds a layer to your Three.js blueprint, or saves the current feature choice (**Keep**, **Later**, or **Never**). Scroll again at the scope recap to start the build. Sandbox updates wait for their own scroll, and the verified site opens in a private inline frame on the last step. Scroll up to reread a step. You can use a wheel, touch swipe, or Page Down.

## Run locally

Requires Node.js 20.11 or newer.

```sh
npm ci
npm start
```

Open [Scrollworks on localhost](http://127.0.0.1:3000). Demo mode generates a self-contained HTML prototype from your brief and the features you keep. The final frame displays it inline and offers an HTML download.

## Enable Agent37 builds

Copy `.env.example` to `.env`, set `AGENT37_API_KEY` and a random `SCROLLWORKS_INSTANCE_TOKEN` of at least 32 characters, then run `npm run setup:shared`. Set `AGENT37_SHARED_INSTANCE_ID` to the ID it prints. Use the same three server-side values for the Sites deployment. Run setup again with the same token to update the existing instance. [Agent37 API keys](https://www.agent37.com/dashboard/cloud/api-keys)

- One Agent37 instance runs the builder. It saves each build in a folder tied to its browser session or signed-in owner. The instance allows six model requests per session and 24 in total per hour, with planning and generation counted separately.
- Scrollworks reads the page over Agent37's private port and renders it in the iframe at the end of the scroll. Each preview URL checks the owner and the build's age.
- The shared builder asks GPT-6 Luna for a compact page. If generation ends incomplete or reaches its 55-second limit, the builder assembles a labeled starter preview from the kept features.
- Each build expires one hour after submission. The instance clears expired folders every minute. **Delete build** removes the folder and its preview immediately.

The Express server binds to loopback by default. For a separate HTTPS deployment, set `HOST`, `BUILDER_ORIGIN`, and `BUILDER_ACCESS_TOKEN`. The HTTP Basic username is `scrollworks` and the password is the access token. The hosted Site uses a signed session cookie for visitors who build without signing in.

`npm run build` packages the application and API as a Sites Worker. The provisioning and private port setup follow the [Agent37 site-builder starter](https://github.com/agent37-platform/examples/tree/eb480068188cda2f912fbbe2e9083e0838ffa81e/site-builder).

The shared instance stays awake so its cleanup runs when Scrollworks is closed. Agent37 meters compute for that instance and model usage for builds.
