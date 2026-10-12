# Walkthrough script (60–90 s): one prompt, two outcomes

Production server (`npm run build && npm start`). Recorded mode works anywhere.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Home: DashDish in the phone, toggle on OFF | This is DashDish, a food app that works today. No scheduled delivery. It's the real build; tap through it. |
| 0:08 | Prompt prefilled, press Apply change | I ask for one change: scheduled delivery for tomorrow. NeverBreak is off. |
| 0:12 | Request → Change → Shipped without checks | The prepared change ships as is. The new Schedule option appears and works… |
| 0:24 | Regular checkout broke | …but a normal order now stops at “Choose a delivery time”. Scheduled delivery was added, but regular checkout broke. |
| 0:34 | Press “Same request with NeverBreak ON” | Same request, same change. This time NeverBreak is on. |
| 0:38 | Check → Regression | It checks the journeys that already worked, in a sandbox and in Chromium, and catches the broken checkout before release. |
| 0:52 | Repair → Verified | A prepared repair goes onto an isolated branch and everything is checked again: old checkout and the new feature. |
| 1:06 | Result and comparison | Scheduled delivery works. Regular checkout still works. Side by side: without NeverBreak, broken; with it, protected. |
| 1:16 | Close on the comparison | The change and the repair were written in advance; the checks and the browser evidence are real. |

## Earlier script


Production server (`npm run build && npm start`). Recorded mode works anywhere; for live, sign in at `/operator` with the worker and Docker running first.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Home: “What would you like to change?” | This is ProofLayer. On the right is DashDish, a food app that works today; underneath, the five journeys NeverBreak protects. |
| 0:08 | Tap through the phone | It's the real build that was verified, not a picture. |
| 0:14 | Type “Add scheduled delivery for tomorrow”, submit | I ask for a change. The request is matched deterministically; this prototype supports this one scenario and says so for anything else. |
| 0:22 | Steps A–C, NeverBreak panel | NeverBreak takes the journeys that worked before and selects the change for this request. The change and its repair were prepared in advance; the badge says whether this is live or a recording. |
| 0:34 | Steps D–E, phone shows the broken checkout | It builds the change in a sandbox and drives the app in Chromium. Scheduled delivery works, but regular checkout now stops at “Choose a delivery time”. Caught before release. |
| 0:50 | Steps F–G | The prepared repair is applied on an isolated branch and everything is checked again: the old journeys and the new feature. |
| 1:02 | The three moments | Before: checkout works. After the change: it broke. After the repair: both delivery options pass. Every frame is a real capture. |
| 1:12 | Result | “Scheduled delivery works. Regular checkout still works.” appears only because the evidence proves both. |
| 1:20 | Behind the Scenes | Commands, exit codes, journey frames, branch and commit, for anyone who wants the detail. |
