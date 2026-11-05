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

Copy `.env.example` to `.env`, set `AGENT37_API_KEY` to a key from a workspace with available compute and managed-model credits, and restart the server. For the private Sites deployment, set the same key as a server-side environment variable in Sites. [Agent37 API keys](https://www.agent37.com/dashboard/cloud/api-keys)

- Submitting an idea provisions a Hermes instance and starts planning. The review step sends the three feature groups back to the same Hermes session to generate the site.
- Scrollworks checks that the instance serves its index page over HTTPS. The private preview reads the generated files through the builder and renders them in a sandboxed iframe.
- Preview access expires one hour after Agent37 creates the sandbox. Revisiting an expired build triggers deletion. **Delete sandbox** ends the build and its billing sooner.

The Express server binds to loopback by default. For a separate HTTPS deployment, set `HOST`, `BUILDER_ORIGIN`, and `BUILDER_ACCESS_TOKEN`. The HTTP Basic username is `scrollworks` and the password is the access token. The private Sites deployment uses Sites authentication.

`npm run build` packages the same application and API as a Sites Worker. The backend adapts the Express and Hermes flow from the [Agent37 site-builder starter](https://github.com/agent37-platform/examples/tree/eb480068188cda2f912fbbe2e9083e0838ffa81e/site-builder).

The Express server also clears expired sandboxes while it is running.
