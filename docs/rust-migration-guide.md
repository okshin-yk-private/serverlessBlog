# Rust Lambda Migration Guide

> **⚠️ DEPRECATED**: このドキュメントは非推奨です。
>
> Rust Lambda実装は2026年1月に削除されました。現在、すべてのLambda関数はGoで実装されています。
>
> Go実装の詳細については `.kiro/steering/golang-migration-plan.md` を参照してください。

---

## [ARCHIVED] Overview

This document describes the traffic routing configuration for migrating from Node.js Lambda functions to Rust Lambda functions.

## Traffic Routing Configuration

Traffic routing is controlled by the `rustTrafficPercent` CDK context parameter:

- `0` (default): Node.js Lambda functions handle all API traffic
- `1-100`: Rust Lambda functions handle all API traffic

## Migration Phases

### Phase 0: Baseline (0%)
```bash
# Default configuration - Node.js only
cdk deploy --context stage=dev
# or explicitly
cdk deploy --context stage=dev --context rustTrafficPercent=0
```

All traffic is routed to Node.js Lambda functions. Rust Lambda stack is not deployed.

### Phase 1: Canary Deployment (10%)
```bash
cdk deploy --context stage=dev --context rustTrafficPercent=10
```

- Rust Lambda stack is deployed and connected to API Gateway
- All API traffic is now handled by Rust functions
- Monitor CloudWatch metrics for errors and latency
- Rollback if issues detected: `cdk deploy --context rustTrafficPercent=0`

### Phase 2: Gradual Rollout (50%)
```bash
cdk deploy --context stage=dev --context rustTrafficPercent=50
```

- Continue monitoring for stability
- Compare performance metrics between Node.js and Rust
- Ensure all endpoints function correctly

### Phase 3: Near-Complete Migration (90%)
```bash
cdk deploy --context stage=dev --context rustTrafficPercent=90
```

- Final validation before full migration
- Verify all edge cases work correctly
- Confirm cold start performance improvements

### Phase 4: Full Migration (100%)
```bash
cdk deploy --context stage=prd --context rustTrafficPercent=100
```

- Complete migration to Rust
- Node.js Lambda functions remain deployed but do not handle traffic
- Can be decommissioned after verification period

## Monitoring

When Rust Lambda is enabled, both Node.js and Rust Lambda functions are added to CloudWatch monitoring:

- Lambda Duration metrics
- Lambda Error metrics
- Lambda Invocation metrics
- CloudWatch Alarms for error rate thresholds

## Rollback Procedure

To rollback to Node.js Lambda:

```bash
# Immediate rollback to Node.js
cdk deploy --context rustTrafficPercent=0

# This will:
# 1. Reconnect API Gateway to Node.js Lambda functions
# 2. Remove Rust Lambda stack
# 3. Restore original configuration
```

## Architecture

```
┌─────────────────┐
│   API Gateway   │
└────────┬────────┘
         │
         ▼
   ┌─────────────┐
   │rustTrafficPercent│
   │   Context   │
   └─────┬───────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Node.js│ │ Rust  │
│Lambda │ │Lambda │
│ Stack │ │ Stack │
└───────┘ └───────┘
```

When `rustTrafficPercent=0`:
- Only Node.js Lambda stack creates API Gateway integrations
- Rust Lambda stack is not instantiated

When `rustTrafficPercent>0`:
- Rust Lambda stack creates API Gateway integrations
- Node.js Lambda stack skips API Gateway integrations
- Both function sets remain deployed for monitoring

## GitHub Actions Deployment

In CI/CD workflows, pass the context parameter:

```yaml
- name: Deploy with Rust Lambda
  run: |
    cdk deploy --all --require-approval never \
      --context stage=${{ env.STAGE }} \
      --context rustTrafficPercent=${{ env.RUST_TRAFFIC_PERCENT }}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `rustTrafficPercent` | Percentage of traffic to route to Rust (0-100) | 0 |
| `stage` | Deployment stage (dev/prd) | dev |
