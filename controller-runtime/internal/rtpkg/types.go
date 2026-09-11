// Package rtpkg mirrors the ControllerRuntimePackage contract defined in the
// backend's controller-runtime-contract.ts (schema version 1).
// These types are used for JSON unmarshalling, HMAC verification, and driving
// the phase engine.
package rtpkg

// Package is the top-level deployment package pushed to the controller.
// Fields must remain in strict alignment with the backend contract.
type Package struct {
	SchemaVersion      int                `json:"schemaVersion"`
	ControllerIdentity ControllerIdentity `json:"controllerIdentity"`
	IntersectionIdentity IntersectionIdentity `json:"intersectionIdentity"`
	OperatingEnvironment string           `json:"operatingEnvironment"`
	DetectorsMapping   []DetectorMapping  `json:"detectorsMapping"`
	SignalGroups       []SignalGroup      `json:"signalGroups"`
	Phases             []Phase            `json:"phases"`
	Interphases        []Interphase       `json:"interphases"`
	TimingPlans        []TimingPlan       `json:"timingPlans"`
	SafetyRules        SafetyRules        `json:"safetyRules"`
	DeploymentMetadata DeploymentMetadata `json:"deploymentMetadata"`
	SignatureMetadata  SignatureMetadata   `json:"signatureMetadata"`
}

// ControllerIdentity contains hardware identity information.
type ControllerIdentity struct {
	ID                           string `json:"id"`
	Code                         string `json:"code"`
	ControllerType               string `json:"controllerType"`
	RuntimeVersion               string `json:"runtimeVersion"`
	FirmwareVersion              string `json:"firmwareVersion"`
	SupportedPackageSchemaVersion int    `json:"supportedPackageSchemaVersion"`
	Environment                  string `json:"environment"`
}

// IntersectionIdentity describes the physical intersection this controller
// manages.
type IntersectionIdentity struct {
	ID        string  `json:"id"`
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	District  string  `json:"district"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// DetectorMapping describes a single vehicle/pedestrian detector.
type DetectorMapping struct {
	ID                           string   `json:"id"`
	Code                         string   `json:"code"`
	Name                         string   `json:"name"`
	Type                         string   `json:"type"` // "loop" | "camera" | "radar" | "pedestrian_button"
	LaneReference                *string  `json:"laneReference"`
	Channel                      string   `json:"channel"`
	ControllerID                 *string  `json:"controllerId"`
	AssignedPhaseSequenceNumbers []int    `json:"assignedPhaseSequenceNumbers"`
	SignalGroupCodes              []string `json:"signalGroupCodes"`
	Active                       bool     `json:"active"`
}

// SignalGroup represents a set of signal heads controlled as a unit.
type SignalGroup struct {
	Code                    string   `json:"code"`
	Name                    string   `json:"name"`
	Approach                string   `json:"approach"`
	MovementGroup           string   `json:"movementGroup"`
	PhaseSequenceNumbers    []int    `json:"phaseSequenceNumbers"`
	ProtectedMovement       bool     `json:"protectedMovement"`
	DetectorCodes           []string `json:"detectorCodes"`
}

// Phase describes one phase in the signal cycle.
type Phase struct {
	SequenceNumber                     int      `json:"sequenceNumber"`
	Name                               string   `json:"name"`
	Approach                           string   `json:"approach"`
	MovementGroup                      string   `json:"movementGroup"`
	PhaseType                          string   `json:"phaseType"` // "vehicle" | "pedestrian" | "transit"
	SignalGroupCode                     string   `json:"signalGroupCode"`
	MinGreenSeconds                    float64  `json:"minGreenSeconds"`
	YellowSeconds                      float64  `json:"yellowSeconds"`
	RedClearanceSeconds                float64  `json:"redClearanceSeconds"`
	PedestrianWalkSeconds              *float64 `json:"pedestrianWalkSeconds"`
	PedestrianClearSeconds             *float64 `json:"pedestrianClearSeconds"`
	IsProtected                        bool     `json:"isProtected"`
	ClearanceGroup                     *string  `json:"clearanceGroup"`
	AllowedConcurrentPhaseSequenceNumbers []int `json:"allowedConcurrentPhaseSequenceNumbers"`
	ConflictingPhaseSequenceNumbers    []int    `json:"conflictingPhaseSequenceNumbers"`
	DetectorCodes                      []string `json:"detectorCodes"`
}

// Interphase defines the clearance transition between two conflicting phases.
type Interphase struct {
	Key                       string `json:"key"`
	FromPhaseSequenceNumber   int    `json:"fromPhaseSequenceNumber"`
	ToPhaseSequenceNumber     int    `json:"toPhaseSequenceNumber"`
	ClearanceSeconds          float64 `json:"clearanceSeconds"`
	TransitionType            string `json:"transitionType"` // "yellow_change" | "all_red" | "pedestrian_clearance"
}

// TimingPlan holds the cycle, offset, and per-stage splits.
type TimingPlan struct {
	ID                string                 `json:"id"`
	Code              string                 `json:"code"`
	Name              string                 `json:"name"`
	Status            string                 `json:"status"`
	CycleLengthSeconds float64               `json:"cycleLengthSeconds"`
	OffsetSeconds     float64                `json:"offsetSeconds"`
	SimulationOnly    bool                   `json:"simulationOnly"`
	StagePlan         []TimingStage          `json:"stagePlan"`
	ScheduleConfig    map[string]interface{} `json:"scheduleConfig"`
}

// TimingStage is a single phase-allocation stage within a timing plan.
type TimingStage struct {
	Key                  string `json:"key"`
	Name                 string `json:"name"`
	SplitSeconds         float64 `json:"splitSeconds"`
	PhaseSequenceNumbers []int  `json:"phaseSequenceNumbers"`
}

// SafetyRules contains the pre-computed conflict and concurrency matrices
// generated by the backend's engineering safety validator.
type SafetyRules struct {
	ValidationSummary     string              `json:"validationSummary"`
	ValidationGeneratedAt string              `json:"validationGeneratedAt"`
	ConflictMatrix        []ConflictEntry     `json:"conflictMatrix"`
	ConcurrencyMatrix     []ConcurrencyEntry  `json:"concurrencyMatrix"`
	MinimumClearances     []ClearanceEntry    `json:"minimumClearances"`
	PhaseValidationErrors   []string          `json:"phaseValidationErrors"`
	PhaseValidationWarnings []string          `json:"phaseValidationWarnings"`
	RuntimeLimits         RuntimeLimits       `json:"runtimeLimits"`
}

// ConflictEntry holds the list of phases that conflict with a given phase.
type ConflictEntry struct {
	PhaseSequenceNumber            int   `json:"phaseSequenceNumber"`
	ConflictingPhaseSequenceNumbers []int `json:"conflictingPhaseSequenceNumbers"`
}

// ConcurrencyEntry holds the list of phases allowed to run concurrently.
type ConcurrencyEntry struct {
	PhaseSequenceNumber                    int   `json:"phaseSequenceNumber"`
	AllowedConcurrentPhaseSequenceNumbers  []int `json:"allowedConcurrentPhaseSequenceNumbers"`
}

// ClearanceEntry holds minimum clearance timing for a phase.
type ClearanceEntry struct {
	PhaseSequenceNumber int     `json:"phaseSequenceNumber"`
	YellowSeconds       float64 `json:"yellowSeconds"`
	RedClearanceSeconds float64 `json:"redClearanceSeconds"`
}

// RuntimeLimits describes hardware capacity constraints.
type RuntimeLimits struct {
	DetectorCapacity    int `json:"detectorCapacity"`
	SignalGroupCapacity int `json:"signalGroupCapacity"`
}

// DeploymentMetadata carries audit and versioning information.
type DeploymentMetadata struct {
	DeploymentID            string                 `json:"deploymentId"`
	PackageVersion          string                 `json:"packageVersion"`
	GeneratedAt             string                 `json:"generatedAt"`
	RequestedAt             string                 `json:"requestedAt"`
	PublishedAt             *string                `json:"publishedAt"`
	OperatingMode           string                 `json:"operatingMode"`
	TargetEnvironment       string                 `json:"targetEnvironment"`
	TargetControllerID      string                 `json:"targetControllerId"`
	TimingPlanCode          string                 `json:"timingPlanCode"`
	ScenarioCode            *string                `json:"scenarioCode"`
	RequiredRuntimeVersion  *string                `json:"requiredRuntimeVersion"`
	CompatibleControllerTypes []string             `json:"compatibleControllerTypes"`
	CompatibilityWarnings   []string               `json:"compatibilityWarnings"`
	RequestPayload          map[string]interface{} `json:"requestPayload"`
}

// SignatureMetadata holds the HMAC-SHA256 integrity proof.
type SignatureMetadata struct {
	Algorithm       string  `json:"algorithm"`       // "HMAC-SHA256"
	DigestAlgorithm string  `json:"digestAlgorithm"` // "SHA-256"
	Digest          string  `json:"digest"`          // hex-encoded SHA-256 of unsigned package
	Signature       *string `json:"signature"`       // hex-encoded HMAC-SHA256; null when unsigned
	SignedAt        *string `json:"signedAt"`        // ISO-8601 timestamp; null when unsigned
	Signer          string  `json:"signer"`          // "stls-control-plane"
}
