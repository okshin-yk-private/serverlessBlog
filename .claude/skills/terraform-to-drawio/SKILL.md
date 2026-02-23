---
name: terraform-to-drawio
description: "Generate AWS architecture diagrams in draw.io (.drawio) format from Terraform source code. Use this skill whenever the user asks to create an architecture diagram, infrastructure diagram, or network topology diagram from Terraform files (.tf), Terraform state, or HCL code. Also trigger when the user mentions 構成図, アーキテクチャ図, drawio, or wants to visualize their AWS infrastructure defined in Terraform/OpenTofu/CDK. Produces diagrams that strictly follow the AWS Architecture Icons guidelines (Release 22-2025.07.31) with correct resource placement hierarchy (VPC内/外), group nesting, official icon shapes, and proper arrow/label formatting."
---

# Terraform to Draw.io AWS Architecture Diagram Generator

## Overview

This skill parses Terraform HCL source code, identifies AWS resources and their relationships,
determines correct spatial placement (VPC内, Subnet内, AZ, Region, etc.), and generates a
standards-compliant `.drawio` XML file using official AWS Architecture Icons (mxgraph.aws4.*).

## Before You Begin

1. Read `references/icon-mapping.md` — Terraform resource type → draw.io shape mapping
2. Read `references/group-hierarchy.md` — Group nesting rules, colors, and draw.io XML patterns
3. Read `references/placement-rules.md` — Which AWS resources belong inside which groups
4. Read `references/drawio-xml-patterns.md` — XML templates for generating valid draw.io files

## Workflow

### Step 1: Parse Terraform Code

Analyze the user's Terraform files to extract:

- All `resource` blocks with their type and logical name
- All `data` blocks referencing existing infrastructure
- All `module` blocks (expand if source is available)
- Key attributes that determine placement:
  - `vpc_id`, `subnet_id`, `subnet_ids` → determines VPC/Subnet membership
  - `availability_zone`, `availability_zones` → determines AZ placement
  - `security_groups`, `vpc_security_group_ids` → Security Group associations
  - References between resources via `resource_type.name.id` patterns

Build an internal dependency graph:

```
{
  "resources": [
    {
      "tf_type": "aws_instance",
      "tf_name": "web",
      "drawio_shape": "mxgraph.aws4.ec2",       // from icon-mapping.md
      "label": "Amazon EC2\nweb",
      "placement": {
        "region": "ap-northeast-1",              // from provider or resource
        "vpc": "aws_vpc.main",                   // resolved from vpc_id reference
        "subnet": "aws_subnet.public_1",         // resolved from subnet_id
        "az": "ap-northeast-1a",                 // from subnet or explicit
        "security_group": "aws_security_group.web_sg"
      }
    }
  ],
  "connections": [
    { "from": "aws_instance.web", "to": "aws_db_instance.main", "label": "MySQL 3306" }
  ]
}
```

### Step 2: Resolve Placement Hierarchy

This is the most critical step. Incorrect placement (e.g., Lambda inside a VPC when no
`vpc_config` is specified, or S3 inside a VPC) produces misleading diagrams.

**Hierarchy (outer → inner):**

```
AWS Cloud
  └── Region
       ├── VPC
       │    ├── Availability Zone (optional grouping)
       │    │    ├── Public Subnet
       │    │    │    └── [resources with public subnet_id]
       │    │    └── Private Subnet
       │    │         └── [resources with private subnet_id]
       │    └── Security Group (optional, overlay)
       │         └── [resources referencing this SG]
       └── [VPC-external regional services: S3, DynamoDB, CloudFront, Route 53, etc.]
```

**Decision rules for placement — consult `references/placement-rules.md` for the full list:**

- If a resource has `subnet_id` or `subnet_ids` → place inside the corresponding Subnet group
- If a resource has `vpc_id` but no subnet → place inside VPC but outside any Subnet
- If a resource has neither `vpc_id` nor `subnet_id` → place outside VPC (regional or global service)
- Some resources like Lambda are conditionally VPC-based: only if `vpc_config` block is present
- For resources where placement is ambiguous, consult the AWS public documentation.
  If MCP tools are available, use them to verify. If not, use web search to confirm.

### Step 3: Calculate Layout Geometry

Compute the (x, y, width, height) for each group and resource icon.

**Layout algorithm:**

1. Start with the outermost group (AWS Cloud) at position (0, 0)
2. Add padding: 40px on all sides for each group level
3. Service icons are 48x48 (standard) or 64x64 (service icons in the deck are 762000 EMU ≈ 64px equivalent)
4. Resource icons are 40x40 (457200 EMU ≈ 40px equivalent)
5. Labels are placed below icons (verticalLabelPosition=bottom)
6. Spacing between icons: minimum 80px horizontal, 60px vertical
7. Groups grow to contain all their children plus padding
8. Inner groups have at least 5px buffer from outer group edges (per AWS guideline)
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

### Step 4: Generate Draw.io XML

Use the templates in `references/drawio-xml-patterns.md` to assemble the XML.

**Key principles:**

- Every group is a `container=1` mxCell with `collapsible=0;recursiveResize=0`
- Children reference their parent group via the `parent` attribute
- Service icons use `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.{service_name}`
- Resource icons use `shape=mxgraph.aws4.{resource_name}` (smaller, no gradient background)
- Arrows use `edgeStyle=orthogonalEdgeStyle` for right-angle lines (per AWS guideline)
- Labels: 12px Arial, service names on max 2 lines
- Use short forms only after full name appears once in the diagram

**File structure:**

```xml
<mxfile host="app.diagrams.net" type="device">
  <diagram id="..." name="AWS Architecture">
    <mxGraphModel dx="..." dy="..." grid="1" gridSize="10" guides="1" tooltips="1"
                  connect="1" arrows="1" fold="1" page="1" pageScale="1"
                  pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- Groups and resources here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### Step 5: Validate and Output

Before writing the file:

1. Verify every resource is placed in a valid group (no orphaned icons floating outside all groups)
2. Verify group nesting is correct (no Subnet outside a VPC, no AZ outside a Region)
3. Verify all `parent` attributes reference valid cell IDs
4. Verify no overlapping geometries within the same parent
5. Verify no icon center falls within any arrow's bounding box or fan-out zone (per Arrow-aware layout rules in Step 3). If overlap exists, apply Rule D shifts before generating output.
6. Verify arrows connect to valid source/target cell IDs
7. Write the `.drawio` file to Current Directory

### Step 5.5: Visual Verification (Optional)

After writing the `.drawio` file, perform a visual verification loop using the drawio MCP
and Playwright MCP tools. This step catches layout issues that structural validation (Step 5)
cannot detect: icon overlap, arrow-icon intersection, label truncation, and overall readability.

**Prerequisites:**
- drawio MCP server is configured (`mcp__drawio__open_drawio_xml` available)
- Playwright MCP server is configured (`@playwright/mcp` in `.mcp.json`)

**Verification flow:**

1. **Open in lightbox mode**: Call `mcp__drawio__open_drawio_xml` with the generated XML
   content and `lightbox=true`. Extract the URL from the response.

2. **Launch Playwright agent**: Use the Task tool to launch a `playwright-test-planner` agent
   with the following instructions:

   ```
   Task(
     subagent_type="playwright-test-planner",
     description="Screenshot drawio diagram for visual verification",
     prompt="
       1. Navigate to this URL: {url_from_step_1}
       2. Wait for the diagram to fully render:
          - Use browser_wait_for to wait for the SVG canvas to appear
            (wait for 'svg' element or '.geDiagramContainer' to be visible)
          - Wait an additional 2 seconds for icon rendering to complete
       3. Take a full-page screenshot using browser_take_screenshot
       4. Use browser_evaluate to extract element position data:
          - Run JavaScript to find all SVG <g> elements with 'data-cell-id' attributes
          - For each element, extract: cell-id, transform (x, y), bounding box (width, height)
          - Return as JSON array
       5. Report back:
          - The screenshot file path
          - The position data JSON
          - Any rendering errors visible in the console (use browser_console_messages)
     "
   )
   ```

3. **Analyze results**: Read the screenshot using the Read tool (supports images).
   Check for these visual issues:

   | Check | What to look for |
   |-------|-----------------|
   | Icon overlap | Two or more icons visually overlapping |
   | Arrow-icon intersection | An arrow passing through an unrelated icon |
   | Label truncation | Labels cut off or overlapping other elements |
   | Group containment | Icons visually outside their parent group boundary |
   | Overall flow clarity | Primary traffic flow should be visually obvious (top-to-bottom or left-to-right) |
   | Empty regions | Large empty spaces that could be compacted |

4. **Fix and iterate**: If issues are found:
   a. Identify the specific resources/groups with problems
   b. Adjust the XML geometry (x, y, width, height) values
   c. Re-write the `.drawio` file
   d. Repeat from step 1 (maximum **2 iterations**)

5. **Skip conditions**: Skip this step if:
   - The diagram has fewer than 5 resources (simple diagrams rarely have layout issues)
   - The user explicitly requests to skip visual verification
   - drawio MCP or Playwright MCP is not available

**Example Playwright JavaScript for position extraction:**

```javascript
// Run via browser_evaluate
(() => {
  const cells = document.querySelectorAll('g[data-cell-id]');
  return Array.from(cells).map(g => {
    const rect = g.getBoundingClientRect();
    return {
      cellId: g.getAttribute('data-cell-id'),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  });
})()
```

### Step 6: Present to User

Use `present_files` to share the `.drawio` file. Provide a brief summary:
- Number of resources identified
- Group hierarchy used
- Any resources whose placement was ambiguous (and how it was resolved)
- Any Terraform resources that were skipped (e.g., `aws_iam_policy` — not typically shown in architecture diagrams)

## Guidelines from AWS Architecture Icons Deck (Release 22-2025.07.31)

### DO
- Use icons at their predefined size, color, and format
- Use straight lines and right angles for arrows
- Break service name labels after the second word if necessary
- Use short forms (e.g., "Amazon EC2") after full name mentioned once
- Order callout numbers linearly: left→right, top→bottom, or clockwise
- Use the correct group border colors and dash patterns (see group-hierarchy.md)

### DON'T
- Crop, flip, rotate, or reshape icons
- Create groups with non-approved AWS icons
- Resize group icons
- Mix callout sizes within the same diagram
- Break a line in the middle of a word
- Use short forms without first mentioning the full service name

## Resource Filtering

Not all Terraform resources warrant inclusion in an architecture diagram. By default:

**Include:** Compute (EC2, Lambda, ECS, EKS, Fargate), Networking (VPC, Subnet, IGW, NAT, ALB/NLB, CloudFront, Route 53, Transit Gateway, VPN), Database (RDS, Aurora, DynamoDB, ElastiCache, Redshift), Storage (S3, EFS, EBS), Application Integration (SQS, SNS, EventBridge, Step Functions, API Gateway), Security (WAF, Shield, KMS, Secrets Manager, ACM), Management (CloudWatch, CloudTrail), Analytics (Kinesis, Glue, Athena, OpenSearch)

**Exclude by default (unless user requests):** IAM (policies, roles, instance profiles), Security Group rules (the SG group box suffices), Route table entries, CloudWatch log groups/metrics, Tags, Terraform backend/provider config

## Error Handling

- If Terraform code references modules without visible source, note which modules were not expanded
- If resource types are unrecognized, use a generic AWS icon (`mxgraph.aws4.resourceIcon`) and flag it
- If VPC/Subnet relationships cannot be resolved, place the resource at the Region level and annotate