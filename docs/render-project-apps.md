# Standalone Render project sites

Generated ready projects are deployed as separate free Render Node web services, each with its own onrender.com domain. Cards and project links open the service root in a new tab. Standalone sites contain no portfolio back link.

The main service requires RENDER_API_KEY; Render supplies RENDER_SERVICE_ID, RENDER_EXTERNAL_URL and RENDER_GIT_BRANCH. The server resolves its own workspace and repository, uses a stable slug/project hash to recover existing services after restart, and creates one service per project. Credentials stay on the main service and are never copied to project services. Deployment errors retry after 60 seconds and are recorded without credentials.

Each child runs scripts/standalone-project.cjs, with PROJECT_ID, PROJECT_SOURCE_URL and a PROJECT_SNAPSHOT. It uses the generated preview and bundled kit CSS, includes browser-local workspace interactions, and refreshes content from the parent every 15 seconds. The deployment snapshot lets a child continue displaying its project after the parent's in-memory portfolio disappears. The project is still a prototype; external business integrations are not synthesized.

Main-service commit 412da11 includes the speech PCM batch compatibility fix inherited from the integrated pipeline. The private demo cookie is still required to start speech. Unlimited mode removes recording-duration limits; it does not remove provider, connection or authentication failures.

Production build, TypeScript and lint checks passed. User requested that microphone and rendered interaction testing be left to them, so no new lintapple or browser interaction pass is claimed.
