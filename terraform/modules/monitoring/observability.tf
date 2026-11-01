# Existing log groups only. IDs remain in logs, never metric dimensions.
locals {
  publication_height = var.enable_publication_observability ? 27 : 0
  publication_sources = join(" | ", [for name in concat(
    var.publication_lambda_log_groups,
    ["/aws/codebuild/${var.codebuild_project_name}"]
  ) : "SOURCE '${name}'"])
  publication_timing_query = <<-QUERY
    ${local.publication_sources}
    | parse @message /(?<payload>\{.*\})/
    | fields jsonParse(payload) as o
    | filter o.event in ["site-build-accepted", "site-public-confirmed", "site-public-unconfirmed"] and ispresent(o.buildId) and ispresent(o.contentRevision)
    | stats min(o.requestedAtMs) as requestedAtMs, min(o.confirmedAtMs) as confirmedAtMs, latest(o.releaseRevision) as releaseRevision, latest(o.event) as lastEvent by o.buildId as buildId, o.contentRevision as contentRevision
    | fields (confirmedAtMs - requestedAtMs) / 1000 as saveToPublicSeconds
    | display buildId, contentRevision, releaseRevision, lastEvent, requestedAtMs, confirmedAtMs, saveToPublicSeconds
    | sort confirmedAtMs desc
    | limit 50
  QUERY
  admin_latency_query      = <<-QUERY
    SOURCE '/aws/apigateway/${var.api_gateway_name}'
    | filter resourcePath like /^\/admin\// and httpMethod != "OPTIONS"
    | fields toNumber(responseLatency) as latencyMs
    | filter ispresent(latencyMs)
    | stats count(*) as measuredRequests, pct(latencyMs, 50) as p50ms, pct(latencyMs, 95) as p95ms, max(latencyMs) as maxMs by httpMethod, resourcePath
    | sort measuredRequests desc
    | limit 30
  QUERY
  admin_errors_query       = <<-QUERY
    SOURCE '/aws/apigateway/${var.api_gateway_name}'
    | filter resourcePath like /^\/admin\// and httpMethod != "OPTIONS"
    | fields toNumber(status) as statusCode
    | filter statusCode >= 400
    | stats count(*) as errors by httpMethod, resourcePath, statusCode
    | sort errors desc
    | limit 30
  QUERY
  backup_success_query     = <<-QUERY
    SOURCE '/aws/lambda/${var.project_name}-content-backup-${var.environment}'
    | filter msg = "content backup completed"
    | sort @timestamp desc
    | limit 1
    | fields @timestamp, prefix, postCount, draftCount, categoryCount
  QUERY
  publication_widgets = [for widget in [
    {
      type       = "text", x = 0, y = 0, width = 24, height = 3
      properties = { markdown = "## Publication / API / backup\nDefault window: 30 hours (daily backup). Use a shorter window for diagnosis; manual refresh or 15 min in console. Queries rerun on refresh; limit only bounds displayed rows, not scan cost. Save timing is the latest coalesced save for each build, not every draft save. Blank timing is unknown, never zero. A successful build alone is not public confirmation. Backup table is the latest success within the selected window; an empty table is not proof of no historical backup." }
    },
    {
      type       = "log", x = 0, y = 3, width = 24, height = 6
      properties = { title = "Save request to verified public manifest (seconds; latest save per build)", region = "ap-northeast-1", view = "table", query = local.publication_timing_query }
    },
    {
      type = "metric", x = 0, y = 9, width = 24, height = 6
      properties = {
        title   = "CodeBuild phase durations (seconds, not stacked; Duration is total)"
        region  = "ap-northeast-1", view = "timeSeries", stacked = false, period = 300, stat = "Average"
        metrics = [for metric in ["Duration", "QueuedDuration", "ProvisioningDuration", "DownloadSourceDuration", "InstallDuration", "PreBuildDuration", "BuildDuration", "PostBuildDuration", "UploadArtifactsDuration", "FinalizingDuration"] : ["AWS/CodeBuild", metric, "ProjectName", var.codebuild_project_name]]
      }
    },
    {
      type       = "log", x = 0, y = 15, width = 12, height = 6
      properties = { title = "Admin API response latency by route (ms)", region = "ap-northeast-1", view = "table", query = local.admin_latency_query }
    },
    {
      type       = "log", x = 12, y = 15, width = 12, height = 6
      properties = { title = "Admin API 4xx / 5xx by route", region = "ap-northeast-1", view = "table", query = local.admin_errors_query }
    },
    {
      type       = "log", x = 0, y = 21, width = 24, height = 6
      properties = { title = "Latest backup completion in selected time window (default 30h)", region = "ap-northeast-1", view = "table", query = local.backup_success_query }
    }
  ] : widget if var.enable_publication_observability]
}
