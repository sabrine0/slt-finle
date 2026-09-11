import { test, expect, request } from "@playwright/test";

const BACKEND_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:4010";

test.describe("backend API @smoke", () => {
  test("GET /engineering/intersections returns a non-empty list with required fields", async () => {
    const api = await request.newContext();
    const res = await api.get(`${BACKEND_URL}/engineering/intersections`);
    expect(res.ok(), `expected 2xx, got ${res.status()} ${res.statusText()}`).toBeTruthy();

    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);

    const first = body[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("code");
    expect(first).toHaveProperty("name");
    expect(typeof first.id).toBe("string");
    expect(typeof first.code).toBe("string");
    expect(typeof first.name).toBe("string");

    await api.dispose();
  });

  test("ai-engineering validation responds 400 to bad payload (proves controller is wired)", async () => {
    const api = await request.newContext();
    const res = await api.post(`${BACKEND_URL}/ai-engineering/study`, {
      data: { code: "TEST", mapCenter: { lat: 0, lng: 0 } },
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
    await api.dispose();
  });
});
