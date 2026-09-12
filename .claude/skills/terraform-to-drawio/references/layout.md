# Layout guidance

Compute the (x, y, width, height) for each group and resource icon.

**Layout algorithm:**

1. Start with the outermost group (AWS Cloud) at position (0, 0)
2. Add padding: 40px on all sides for each group level
3. Service icons are 48x48 (suggested) or 64x64 (suggested larger size)
4. Resource icons are 40x40 (suggested smaller size)
5. Labels are placed below icons (verticalLabelPosition=bottom)
6. Spacing between icons: minimum 80px horizontal, 60px vertical
7. Groups grow to contain all their children plus padding
8. Inner groups have at least 5px buffer from outer group edges (local layout convention)
9. Callout numbers: order left→right, top→bottom, or clockwise

**Arrow-aware layout rules (prevent icon / arrow-path overlap):**

> Apply these rules **after** initial icon placement (rules 1-9 above) and **before** finalizing canvas size.

**Rule A — Row-Based Tier Assignment**

Assign every icon to a horizontal row (tier) based on its depth in the connection graph:

| Tier | Category | Examples |
|------|----------|----------|
| 0 | External | Users, Internet |
| 1 | Global services | Route 53, CloudFront, ACM, WAF |
| 2 | Regional edge | API Gateway, S3, ALB/NLB, CloudWatch |
| 3+ | Internal services | Lambda, DynamoDB, RDS, ECS, SQS, etc. |

- Icons in different tiers must be separated by at least `tier_gap = max(100px, 60px + label_height)`.
- Icons within the same tier share the same y-center.

**Rule A+ — Primary Flow Alignment**

After tier assignment, identify the **primary ingress target** for each Tier 0 icon and align them vertically:

1. **Identify the primary ingress target** (Tier に関係なく):
   - From each Tier 0 icon (Users, Internet), examine all outgoing arrows.
   - The **primary ingress target** is the directly-connected service that has the **most outgoing arrows to downstream services** (i.e., the highest fan-out count). This heuristic selects the main request-routing service (e.g., CloudFront, API Gateway, ALB) over auxiliary services (e.g., Route 53 for DNS).
   - Tie-breaker: prefer the service in the lower-numbered tier (closer to external). If still tied, prefer the service that appears first left-to-right.

2. **X-align Tier 0 icon with its primary ingress target** (±24px tolerance, half an icon width). This ensures the entry point and the first service are vertically aligned regardless of which tier the target belongs to.

3. **Continue the chain**: for each icon in the primary chain, its primary downstream target (the target carrying the main request flow — typically the arrow without a branch label, or the one with the highest fan-out) should also be x-aligned when in adjacent tiers.

4. **Top-to-bottom placement**: Tier 0 icons are placed **above** the AWS Cloud group boundary. The Tier 0 icon's y-position should be `cloud_y - tier_gap - icon_height` so that a straight downward arrow reaches the target.

5. **Secondary services off the main axis**: Services that connect **to** the primary flow but are not **on** the primary flow (e.g., Route 53 providing DNS resolution, ACM providing certificates) should be placed to the **side** (left or right) of the primary chain, not between the Tier 0 icon and the primary target.

**Rule B — Fan-Out Zone Reservation**

When an icon has **3 or more outgoing arrows**, compute the fan-out zone:

```
fan_left  = min(target_x for all targets) - 40px
fan_right = max(target_x + icon_width for all targets) + 40px
fan_y_top = source_y + icon_height
fan_y_bot = min(target_y for all targets)
```

- No **other** icon's center (on the same tier as the source) may fall within `[fan_left, fan_right]`.
- On conflict: shift the colliding icon away from the source center — left if already left, right if already right.

**Rule C — Arrow Path Bounding Box**

For each arrow, compute the orthogonal-route bounding box with ±10 px padding:

```
arrow_bbox = {
  x: min(source_center_x, target_center_x) - 10,
  y: min(source_center_y, target_center_y) - 10,
  w: |source_center_x - target_center_x| + 20,
  h: |source_center_y - target_center_y| + 20
}
```

- No **unrelated** icon's center may fall within any `arrow_bbox`.
- When multiple arrows exist, take the union of all bounding boxes to form a **combined arrow corridor**.

**Rule D — Post-Placement Overlap Validation**

After all icons are placed, run a validation pass:

1. For every icon, check whether its center is inside any `arrow_bbox` (Rule C) or fan-out zone (Rule B) to which it is not an endpoint.
2. On conflict: shift the icon horizontally away from the arrow's source (minimum 40 px buffer from the bbox/zone edge).
3. Run up to **3 iterations**. If conflicts remain after 3 iterations, increase `tier_gap` by 40 px and re-run the full layout from Rule A.

**Recommended canvas sizing:**

- Simple diagrams (< 10 resources): 800 x 600
- Medium diagrams (10-30 resources): 1200 x 900
- Complex diagrams (30+ resources): 1600 x 1200+

