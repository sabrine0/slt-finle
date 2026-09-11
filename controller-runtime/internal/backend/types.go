// Package backend contains the HTTP client and data types used when
// communicating with the STLS control-plane backend.
package backend

import "encoding/json"

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// BootstrapRequest is the body sent to POST /controller-runtime/bootstrap.
type BootstrapRequest struct {
	ClientID       string `json:"clientId"`
	ClientSecret   string `json:"clientSecret"`
	ControllerCode string `json:"controllerCode,omitempty"`
}

// BootstrapResponse is the body returned by POST /controller-runtime/bootstrap.
type BootstrapResponse struct {
	AccessToken      string             `json:"accessToken"`
	TokenType        string             `json:"tokenType"`
	ExpiresIn        int                `json:"expiresIn"` // seconds
	Controller       ControllerSummary  `json:"controller"`
	LatestDeployment *DeploymentSummary `json:"latestDeployment"`
}

// ─── Package fetch ────────────────────────────────────────────────────────────

// PackageResponse is the body returned by GET /controller-runtime/packages/latest.
type PackageResponse struct {
	Controller ControllerSummary  `json:"controller"`
	Deployment *DeploymentSummary `json:"deployment"`
	// Package is the raw ControllerRuntimePackage JSON object.
	// We keep it as json.RawMessage so the rtpkg package can unmarshal it.
	Package json.RawMessage `json:"package"`
}

// ─── Deployment acknowledgment ───────────────────────────────────────────────

// AcknowledgeRequest is the body sent to
// POST /controller-runtime/deployments/:id/acknowledge.
type AcknowledgeRequest struct {
	PackageVersion   string `json:"packageVersion"`
	PackageDigest    string `json:"packageDigest"`
	SignatureVerified bool   `json:"signatureVerified"`
	// State is one of: "acknowledged", "applied", "rejected".
	State           string `json:"state"`
	RejectionReason string `json:"rejectionReason,omitempty"`
	RuntimeVersion  string `json:"runtimeVersion,omitempty"`
}

// AcknowledgeResponse is the body returned by the acknowledge endpoint.
type AcknowledgeResponse struct {
	Acknowledged bool   `json:"acknowledged"`
	State        string `json:"state"`
	DeploymentID string `json:"deploymentId,omitempty"`
	Reason       string `json:"reason,omitempty"`
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

// HeartbeatRequest is the body sent to POST /controller-runtime/heartbeat.
type HeartbeatRequest struct {
	RuntimeVersion  string                 `json:"runtimeVersion,omitempty"`
	SoftwareVersion string                 `json:"softwareVersion,omitempty"`
	PackageVersion  string                 `json:"packageVersion,omitempty"`
	UptimeHours     int                    `json:"uptimeHours,omitempty"`
	TelemetrySummary map[string]interface{} `json:"telemetrySummary,omitempty"`
}

// HeartbeatResponse is the body returned by the heartbeat endpoint.
type HeartbeatResponse struct {
	Accepted        bool              `json:"accepted"`
	ReceivedAt      string            `json:"receivedAt"`
	ControllerState ControllerSummary `json:"controllerState"`
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

// TelemetryRequest is the body sent to POST /controller-runtime/telemetry.
type TelemetryRequest struct {
	Summary  string                 `json:"summary"`
	Severity string                 `json:"severity,omitempty"` // "info" | "warning" | "critical"
	Payload  map[string]interface{} `json:"payload,omitempty"`
}

// ─── Alarms ───────────────────────────────────────────────────────────────────

// AlarmRequest is the body sent to POST /controller-runtime/alarms.
type AlarmRequest struct {
	Severity    string `json:"severity"` // "info" | "warning" | "critical"
	Title       string `json:"title"`
	Detail      string `json:"detail"`
	TriggeredAt string `json:"triggeredAt,omitempty"` // ISO-8601
}

// ─── Shared sub-types ─────────────────────────────────────────────────────────

// ControllerSummary is the abbreviated controller object returned in several
// backend responses.
type ControllerSummary struct {
	ID                       string `json:"id"`
	Code                     string `json:"code"`
	ControllerType           string `json:"controllerType"`
	ConnectionState          string `json:"connectionState"`
	LastDeploymentState      string `json:"lastDeploymentState"`
	LastDeployedPackageVersion string `json:"lastDeployedPackageVersion"`
	OperatingEnvironment     string `json:"operatingEnvironment"`
	UptimeHours              int    `json:"uptimeHours"`
}

// DeploymentSummary is the abbreviated deployment object returned in several
// backend responses.
type DeploymentSummary struct {
	ID             string `json:"id"`
	PackageVersion string `json:"packageVersion"`
	Status         string `json:"status"`
	PublishedAt    string `json:"publishedAt"`
}

// ─── Error response ───────────────────────────────────────────────────────────

// ErrorResponse represents a generic backend error body.
type ErrorResponse struct {
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	Error      string `json:"error,omitempty"`
}
