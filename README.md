# Scrollworks

Type a website idea and follow it through four chapters. Scroll to assemble a Three.js blueprint drawn from the proposed screens and their UI blocks, review feature cards one at a time, and read sandbox updates. Choose **Keep**, **Later**, or **Never** on each feature card. Scroll past the scope recap to begin the build. Each sandbox update adds a short step with an explanation, and the verified site appears in an inline preview at the end.

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
- Agent37 bills for instance resources and managed-model usage. Scrollworks enables idle sleep on each sandbox. **Delete sandbox** removes a generated site and ends billing for that instance. You can also manage instances in the Agent37 dashboard.

The Express server binds to loopback by default. For a separate HTTPS deployment, set `HOST`, `BUILDER_ORIGIN`, and `BUILDER_ACCESS_TOKEN`. The HTTP Basic username is `scrollworks` and the password is the access token. The private Sites deployment uses Sites authentication.

`npm run build` packages the same application and API as a Sites Worker. The backend adapts the Express and Hermes flow from the [Agent37 site-builder starter](https://github.com/agent37-platform/examples/tree/eb480068188cda2f912fbbe2e9083e0838ffa81e/site-builder).
