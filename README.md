# Scrollworks

Type a website idea and follow it through four chapters. A Three.js blueprint fills in as you scroll. Sort the feature cards into **Keep**, **Later**, or **Never** to set the first build's scope. The build desk opens after you confirm and shows progress alongside a short field guide.

## Run locally

Requires Node.js 20.11 or newer.

```sh
npm ci
npm start
```

Open [Scrollworks on localhost](http://127.0.0.1:3000). Demo mode generates a self-contained HTML prototype from your brief and the features you keep. You can preview it in the browser and download the file.

## Enable Agent37 builds

Copy `.env.example` to `.env`, set `AGENT37_API_KEY` to a key from a workspace with available compute and managed-model credits, and restart the server. For the private Sites deployment, set the same key as a server-side environment variable in Sites. [Agent37 API keys](https://www.agent37.com/dashboard/cloud/api-keys)

- Submitting an idea provisions a Hermes instance and starts planning. The review step sends the three feature groups back to the same Hermes session to generate the site.
- Scrollworks checks that the instance serves its index page over HTTPS before issuing a 15-minute private preview link. **Publish public link** explicitly opens the generated site on port 8788.
- Agent37 bills for instance resources and managed-model usage. Scrollworks enables idle sleep on each sandbox. **Delete sandbox** removes a generated site and ends billing for that instance. You can also manage instances in the Agent37 dashboard.

The Express server binds to loopback by default. For a separate HTTPS deployment, set `HOST`, `BUILDER_ORIGIN`, and `BUILDER_ACCESS_TOKEN`. The HTTP Basic username is `scrollworks` and the password is the access token. The private Sites deployment uses Sites authentication.

`npm run build` packages the same application and API as a Sites Worker. The backend adapts the Express and Hermes flow from the [Agent37 site-builder starter](https://github.com/agent37-platform/examples/tree/eb480068188cda2f912fbbe2e9083e0838ffa81e/site-builder).
