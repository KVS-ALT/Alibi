# Render Workflows deployment

Branch: `feature/render-workflows-only`.

The browser deployment form is prepared for `alibi-workflows`, Oregon, Node,
build `npm ci --include=dev`, start `npx tsx workflows/main.ts`.
The existing inference credential was entered in Render's masked environment field.
Render currently blocks creation until a payment card is added. No Workflow service
or live run has been verified. Existing web hosting has not been switched.

After completing Render's card requirement:

1. Deploy the prepared Workflow and verify `buildPortfolio` is registered.
2. Set the web service's `RENDER_BUILD_TASK` to `alibi-workflows/buildPortfolio`.
   Keep its existing `RENDER_API_KEY`; keep inference credentials on the Workflow.
3. Change the web service branch to `feature/render-workflows-only` and deploy.
4. Run a synthetic portfolio session and verify a completed task in Render's run history.

The dispatch adapter fails closed without Workflow configuration or after a failed
task. It does not call the inference provider directly. The frontend remains a web
service because Workflow tasks do not serve incoming HTTP traffic.
