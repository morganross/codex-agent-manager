# Test 15: Mid-Turn Steering - Progress Report

## Test Details
- **Test Name:** Mid-Turn Steering
- **Date:** June 12, 2026
- **Status:** PASS

## Steps Taken
1. Created local Codex agent `cam-steer-smoke-2`.
2. Sent an initial long-running request.
3. Confirmed the agent was `active` with active turn ID `019ebc74-24a2-7b50-9aaf-937e024ca9a8`.
4. Sent a second message while that turn was active.
5. Read the target thread.

## Evidence
- **Initial Message ID:** `4cc01155-b5ea-4153-81d5-c91d9442a735`
- **Initial Delivery:** `started`
- **Steering Message ID:** `8caea63e-5a30-44e0-ad6c-1424321961df`
- **Steering Delivery:** `steered`
- **Shared Turn ID:** `019ebc74-24a2-7b50-9aaf-937e024ca9a8`
- **Latest User Message:** Contains `STEER_HELLO mid-turn steering test`.
- **Latest Agent Message:** `The 45-second hold is in progress. I received the mid-turn steering message and will acknowledge it in the reply after the wait completes.`

## Failure Found And Fixed
The first steering attempt queued with `error: "no active turn to steer"` because `#ensureThread` tried to resume/recreate a thread even when CAM already had a live `activeTurnId`.

The fix preserves active turns in `#ensureThread` so `turn/steer` can target the active turn directly.

## Evaluation & Success Criteria
- **Long-running active turn existed:** PASS.
- **Second message used `turn/steer`:** PASS.
- **Same turn ID preserved:** PASS.
- **Agent saw the steered message mid-turn:** PASS.
- **Conclusion:** Mid-turn steering passes.
