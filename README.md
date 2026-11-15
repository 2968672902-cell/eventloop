# EventLoop

## Local shared-handoff prototype

A separate two-account, local-server prototype is available in [`shared/`](shared/README.md). On Windows, start it with `Start-EventLoop.cmd`, then open `http://127.0.0.1:8787/` and `http://localhost:8787/` for two isolated login sessions on the same computer. It supports shared direct-handoff and storage-bridge requests and two-party confirmation. Storage access and transportation must still be arranged with the relevant people. It is not publicly deployed. Use test-only passwords and see the shared README for limits and instructions.

## Earlier single-browser planner (v2)

The remainder of this README describes the separate v2 planner in the root directory. Its localStorage and features are independent of the shared prototype above.

**One event ends. Another begins.** EventLoop is a local browser prototype exploring how campus organisers might pass whole event materials on when the venue must be cleared before the next event can collect them. It suggests a direct handoff, or a temporary storage bridge when the configured dates and item-slot capacity permit one.

## Run locally

No build step, package installation, account or API key is needed. From this directory, start a static server:

```sh
python -m http.server 8000
```

Visit <http://localhost:8000>. On Windows, `py -m http.server 8000` works if Python is installed. Use a modern browser with JavaScript and local storage enabled. The interface loads Google Fonts when available and falls back to local fonts otherwise.

## Try the prototype

1. Open **Materials** to see the fictional sample items and their availability and venue-clearance dates. Sample dates are set relative to the day the demo is first opened or reset.
2. Under **Plan your pickup**, leave the default event name, select **Any type**, and choose a pickup date five days from the seed date. Select **Find a path**. The sample workshop board can be collected directly, while the welcome sign can reach the pickup date through the sample student union cupboard. The banner can also use that cupboard before a slot is reserved.
3. Select **Reserve in demo** on the welcome sign's storage path. This marks the item reserved and simulates occupying one storage slot for the date interval; it does not contact anyone or book a real space. Search again and the same one-slot cupboard is unavailable for another overlapping storage path. Select **Release** on the reserved card to restore its availability.
4. Add a whole item under **Have something to pass on?** or a storage point under **Temporary storage**, then search using a relevant material type and pickup date. **Reset demo** replaces this version's local data with fresh fictional examples after confirmation.
5. **Mark demo handoff** changes a reserved card's local status. It is a simulation and does not independently confirm that a physical transfer or reuse took place.

## How matching works

- A direct pickup is shown when the item is available and the requested pickup date falls on or before the venue-clearance date. The pickup date must be today or later.
- When pickup is after clearance, a storage option requires an intake date at or after the item's availability, the storage point's opening date and today; intake must also be on or before both clearance and the storage point's last intake date. The storage point must be able to hold the item through the requested pickup date.
- The prototype selects the latest permitted intake date and checks that one item slot remains free for the whole intake-to-pickup interval. Dates are inclusive: an intake on the clearance date is permitted, and both the intake and pickup dates count toward occupancy. Direct paths are displayed first. A result that has no valid route explains why in general terms.
- Each listed item occupies one slot. Existing local storage reservations and demo handoffs count during their stated date intervals; releasing a reservation frees its slot. Date comparisons are based on the browser's local calendar date, not time of day.

This is a deliberately simplified scheduling model. It does **not** check material dimensions, weight, compatibility, safe storage conditions, transport, access permissions, actual opening hours or other real-world arrangements. A storage point may be unsuitable even when the demo reports a date-and-slot match. People must inspect the item and arrange the transfer independently.

## Data and prototype boundaries

**This is a single-browser demonstration, not a shared marketplace.** Listings, storage points, reservations and handoff marks are saved in `localStorage` for the browser and origin used. There is no account, shared backend, notification, conflict-safe multi-user reservation, or independent confirmation by two parties. Other people cannot see a listing or a reservation just because it appears here.

This version uses `eventloop-handoff-v2` and does not import or overwrite records from the earlier `eventloop-v1` prototype. Earlier data remains in its original browser storage. Reset affects only the new version's data. Browser storage is origin-specific: opening via a local file and via a local web server may show different data.

All preloaded materials, storage points and activity are fictional examples. The prototype has not established a campus partnership, verified a physical handoff, or measured waste reduction. A local reservation or handoff mark is not evidence of diversion or reuse.

## Problem and proposed measurement

Campus events can leave behind usable signs and decorations when a venue must be cleared before the next organiser can collect them. EventLoop explores whether a visible handoff window and an explicitly modelled storage bridge help organisers plan reuse.

A future pilot could record physically verified transfers and later confirmed reuse, measured item counts and material mass or area, and what the original organiser would otherwise have done with each item. It should record failed handoffs and storage costs, distinguish simulated activity from real evidence, and compare against an explicit baseline before claiming avoided waste. No such pilot is represented by the sample data.

## Attribution and development

EventLoop was developed with AI assistance from OpenAI Codex for concept exploration, implementation, testing support and submission materials. The project builds on existing material-reuse and event-circularity ideas; it does not claim to invent them. Relevant prior examples reviewed during development include [CircularCut](https://github.com/climate-hacktion-2026/circularcut), a materials and cutting-plan prototype, and [Hup naar the Hub!](https://www.leadership-circular-transition.nl/vorige-edities/hackathon-2026/final-concepts-highlights), a festival-equipment reuse and return concept. EventLoop focuses on campus event clearance and date-limited handoff planning.

## Next steps

- Speak with campus organisers about real clearance times, existing storage, access and collection constraints.
- Pilot a small number of permission-based handoffs, recording failed as well as completed transfers and an explicit baseline.
- Consider shared accounts, two-party confirmation and conflict-safe reservations after validating the workflow.
- Model physical fit, accepted material types, transport and time-of-day constraints where reliable information is available.
