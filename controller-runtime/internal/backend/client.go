package backend

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	// tokenExpiryBuffer is how far before actual expiry we treat a token as
	// expired to avoid last-second races.
	tokenExpiryBuffer = 2 * time.Minute

	// httpTimeout is the per-request deadline for the controller runtime.
	httpTimeout = 15 * time.Second
)

// tokenCache holds the JWT issued at bootstrap and its computed expiry wall-clock time.
type tokenCache struct {
	mu          sync.RWMutex
	accessToken string
	expiresAt   time.Time
}

func (tc *tokenCache) set(token string, ttlSeconds int) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.accessToken = token
	tc.expiresAt = time.Now().Add(time.Duration(ttlSeconds) * time.Second)
}

func (tc *tokenCache) get() (string, bool) {
	tc.mu.RLock()
	defer tc.mu.RUnlock()
	if tc.accessToken == "" {
		return "", false
	}
	if time.Now().Add(tokenExpiryBuffer).After(tc.expiresAt) {
		return "", false // expired (or about to expire)
	}
	return tc.accessToken, true
}

func (tc *tokenCache) clear() {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.accessToken = ""
	tc.expiresAt = time.Time{}
}

// persistedToken is the on-disk representation of a cached token.
type persistedToken struct {
	AccessToken string    `json:"accessToken"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client handles all HTTP communication with the STLS backend.
// It manages token lifecycle (bootstrap, caching, refresh) and provides
// graceful degradation when the backend is unreachable.
type Client struct {
	baseURL        string
	clientID       string
	clientSecret   string
	controllerCode string
	tokenCachePath string

	token      tokenCache
	httpClient *http.Client
	log        *slog.Logger
}

// NewClient creates a ready-to-use backend Client.
func NewClient(
	baseURL, clientID, clientSecret, controllerCode, tokenCachePath string,
	log *slog.Logger,
) *Client {
	c := &Client{
		baseURL:        baseURL,
		clientID:       clientID,
		clientSecret:   clientSecret,
		controllerCode: controllerCode,
		tokenCachePath: tokenCachePath,
		httpClient:     &http.Client{Timeout: httpTimeout},
		log:            log,
	}
	// Attempt to restore a previously persisted token so the runtime can
	// skip bootstrap on restarts.
	c.loadPersistedToken()
	return c
}

// ─── Public API calls ─────────────────────────────────────────────────────────

// Bootstrap authenticates the controller with the backend and obtains a JWT
// access token. It saves the token to disk for subsequent restarts.
func (c *Client) Bootstrap(ctx context.Context) (*BootstrapResponse, error) {
	body := BootstrapRequest{
		ClientID:     c.clientID,
		ClientSecret: c.clientSecret,
	}
	if c.controllerCode != "" {
		body.ControllerCode = c.controllerCode
	}

	var resp BootstrapResponse
	if err := c.postPublic(ctx, "/controller-runtime/bootstrap", body, &resp); err != nil {
		return nil, fmt.Errorf("bootstrap: %w", err)
	}

	c.token.set(resp.AccessToken, resp.ExpiresIn)
	c.persistToken(resp.AccessToken, resp.ExpiresIn)

	c.log.Info("bootstrap successful",
		"controller_id", resp.Controller.ID,
		"controller_code", resp.Controller.Code,
		"token_ttl_seconds", resp.ExpiresIn,
	)
	return &resp, nil
}

// FetchLatestPackage retrieves the latest published deployment package for
// this controller. Returns (nil, nil) when the backend has no package yet.
func (c *Client) FetchLatestPackage(ctx context.Context) (*PackageResponse, error) {
	token, err := c.requireToken(ctx)
	if err != nil {
		return nil, err
	}

	var resp PackageResponse
	if err := c.getAuth(ctx, token, "/controller-runtime/packages/latest", &resp); err != nil {
		return nil, fmt.Errorf("fetch package: %w", err)
	}
	return &resp, nil
}

// AcknowledgeDeployment tells the backend whether this controller has
// successfully applied (or rejected) a deployment package.
func (c *Client) AcknowledgeDeployment(
	ctx context.Context,
	deploymentID string,
	req AcknowledgeRequest,
) (*AcknowledgeResponse, error) {
	token, err := c.requireToken(ctx)
	if err != nil {
		return nil, err
	}

	var resp AcknowledgeResponse
	path := fmt.Sprintf("/controller-runtime/deployments/%s/acknowledge", deploymentID)
	if err := c.postAuth(ctx, token, path, req, &resp); err != nil {
		return nil, fmt.Errorf("acknowledge deployment: %w", err)
	}
	return &resp, nil
}

// Heartbeat sends a periodic liveness ping to the backend.
func (c *Client) Heartbeat(ctx context.Context, req HeartbeatRequest) (*HeartbeatResponse, error) {
	token, err := c.requireToken(ctx)
	if err != nil {
		return nil, err
	}

	var resp HeartbeatResponse
	if err := c.postAuth(ctx, token, "/controller-runtime/heartbeat", req, &resp); err != nil {
		return nil, fmt.Errorf("heartbeat: %w", err)
	}
	return &resp, nil
}

// UploadTelemetry sends structured telemetry data to the backend.
func (c *Client) UploadTelemetry(ctx context.Context, req TelemetryRequest) error {
	token, err := c.requireToken(ctx)
	if err != nil {
		return err
	}

	if err := c.postAuth(ctx, token, "/controller-runtime/telemetry", req, nil); err != nil {
		return fmt.Errorf("upload telemetry: %w", err)
	}
	return nil
}

// UploadAlarm reports an alarm condition to the backend.
func (c *Client) UploadAlarm(ctx context.Context, req AlarmRequest) error {
	token, err := c.requireToken(ctx)
	if err != nil {
		return err
	}

	if err := c.postAuth(ctx, token, "/controller-runtime/alarms", req, nil); err != nil {
		return fmt.Errorf("upload alarm: %w", err)
	}
	return nil
}

// ─── Token management ─────────────────────────────────────────────────────────

// requireToken returns a valid access token, bootstrapping if needed.
func (c *Client) requireToken(ctx context.Context) (string, error) {
	if tok, ok := c.token.get(); ok {
		return tok, nil
	}
	// Token missing or expired — re-bootstrap.
	c.log.Info("access token expired or missing, re-bootstrapping")
	resp, err := c.Bootstrap(ctx)
	if err != nil {
		return "", fmt.Errorf("re-bootstrap: %w", err)
	}
	return resp.AccessToken, nil
}

// persistToken saves the token to disk so the runtime can resume without
// bootstrapping after a process restart.
func (c *Client) persistToken(accessToken string, ttlSeconds int) {
	if c.tokenCachePath == "" {
		return
	}
	pt := persistedToken{
		AccessToken: accessToken,
		ExpiresAt:   time.Now().Add(time.Duration(ttlSeconds) * time.Second),
	}
	data, err := json.Marshal(pt)
	if err != nil {
		return
	}
	if err := os.MkdirAll(dirOf(c.tokenCachePath), 0o700); err != nil {
		return
	}
	_ = os.WriteFile(c.tokenCachePath, data, 0o600)
}

// loadPersistedToken attempts to restore a valid token from disk.
func (c *Client) loadPersistedToken() {
	if c.tokenCachePath == "" {
		return
	}
	data, err := os.ReadFile(c.tokenCachePath)
	if err != nil {
		return
	}
	var pt persistedToken
	if err := json.Unmarshal(data, &pt); err != nil {
		return
	}
	remaining := time.Until(pt.ExpiresAt)
	if remaining <= tokenExpiryBuffer {
		c.log.Debug("persisted token expired, will re-bootstrap")
		return
	}
	c.token.mu.Lock()
	c.token.accessToken = pt.AccessToken
	c.token.expiresAt = pt.ExpiresAt
	c.token.mu.Unlock()
	c.log.Info("restored access token from disk", "remaining", remaining.Round(time.Second))
}

// InvalidateToken clears the cached token, forcing a re-bootstrap on the next
// authenticated request.
func (c *Client) InvalidateToken() {
	c.token.clear()
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

// postPublic performs a POST to a path that requires no authentication.
func (c *Client) postPublic(ctx context.Context, path string, body, out interface{}) error {
	return c.do(ctx, http.MethodPost, path, "", body, out)
}

// postAuth performs an authenticated POST.
func (c *Client) postAuth(ctx context.Context, token, path string, body, out interface{}) error {
	return c.do(ctx, http.MethodPost, path, token, body, out)
}

// getAuth performs an authenticated GET.
func (c *Client) getAuth(ctx context.Context, token, path string, out interface{}) error {
	return c.do(ctx, http.MethodGet, path, token, nil, out)
}

// do executes an HTTP request and decodes the JSON response into out.
// out may be nil when the response body is not needed.
func (c *Client) do(
	ctx context.Context,
	method, path, bearerToken string,
	body, out interface{},
) error {
	url := c.baseURL + path

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "stls-controller-runtime/1.0")
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == http.StatusUnauthorized {
		// Invalidate the token so the next call will re-bootstrap.
		c.token.clear()
		return fmt.Errorf("unauthorized (401) — token invalidated")
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Try to extract a human-readable error message from the response.
		var errBody ErrorResponse
		if jerr := json.Unmarshal(respBody, &errBody); jerr == nil && errBody.Message != "" {
			return fmt.Errorf("backend error %d: %s", resp.StatusCode, errBody.Message)
		}
		return fmt.Errorf("backend error %d: %s", resp.StatusCode, string(respBody))
	}

	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("unmarshal response: %w", err)
		}
	}

	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// dirOf returns the directory component of a file path.
func dirOf(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[:i]
		}
	}
	return "."
}
