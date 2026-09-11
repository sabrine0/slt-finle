# SMART TRAFFIC LIGHT SYSTEM (STLS HYBRID)

## FINAL FULL PRODUCT + ARCHITECTURE SPECIFICATION

---

# 1. PRODUCT OVERVIEW

STLS Hybrid is a **government-grade smart traffic management platform** designed to:

* Monitor and control city-wide traffic in real time
* Integrate with existing Moroccan infrastructure
* Support adaptive (AI) and manual control
* Provide a modern operations dashboard (like Google Maps view)
* Ensure high security and reliability

---

# 2. SYSTEM STRUCTURE

## 2.1 LAYERS

### FIELD LAYER

* Traffic lights
* Pedestrian signals
* Loop detectors
* Buttons

---

### EDGE LAYER (SMART CONTROLLER)

* Executes traffic logic
* Controls signals
* Reads sensors
* Works offline
* Sends data to backend

---

### BACKEND LAYER

* APIs
* Services
* AI engine
* Database

---

### APPLICATION LAYER

#### 1. Engineering Studio

#### 2. Command Platform (your UI)

---

# 3. COMMAND PLATFORM (MAIN UI LIKE YOUR IMAGE)

## 3.1 GOOGLE MAPS INTEGRATION

* Use **Google Maps JavaScript API**
* User will provide API key
* Map must support:

  * traffic layer
  * markers for intersections
  * real-time updates

---

## 3.2 MAP FEATURES

* Colored traffic lines:

  * Green → smooth
  * Yellow → pressure
  * Red → congestion
* Intersection markers
* Click → popup info

Popup example:

* name
* mode (adaptive/manual)
* queue length
* incidents

---

## 3.3 DASHBOARD METRICS

* Throughput
* Delay index
* Active controllers
* Incidents count

---

## 3.4 RIGHT PANEL (LIKE YOUR UI)

### Intersection Status

* Name
* Location
* Mode
* Status

---

### Scenario Control

* Dropdown scenarios:

  * Normal traffic
  * Peak traffic
  * Emergency
* Buttons:

  * Run scenario
  * Stop system

---

### Hardware Status

* Controller ID
* Connection state
* Mode (real / simulation)

---

# 4. ENGINEERING PLATFORM

## FEATURES

* Create intersection
* Configure:

  * phases
  * timings
  * detectors
* Simulation
* Export config

---

# 5. CONTROLLER SYSTEM

## 5.1 MODES

* Fixed
* Adaptive
* Manual
* Emergency
* Flash
* Fail-safe

---

## 5.2 FUNCTION

* Control lights
* Read sensors
* Apply logic
* Communicate with backend

---

# 6. AI SYSTEM

## FUNCTION

* Predict traffic
* Optimize signals

## RULE

* AI NEVER overrides police
* Can be disabled

---

# 7. BACKEND ARCHITECTURE

## TECH STACK

* Frontend: Next.js + React
* Backend: NestJS or ASP.NET
* DB: PostgreSQL
* Realtime: WebSocket

---

## SERVICES

* Auth service
* Traffic service
* Deployment service
* Telemetry service
* AI service

---

# 8. DATABASE (CORE)

Tables:

* intersections
* controllers
* phases
* detectors
* signals
* events
* alarms
* users
* roles

---

# 9. SECURITY

* JWT authentication
* MFA
* RBAC
* TLS encryption
* Signed configs
* Audit logs

---

# 10. HARDWARE INTEGRATION

Controller must:

* connect via:

  * Ethernet
  * SIM (4G)
* read:

  * loop sensors
* control:

  * traffic lights

---

# 11. DEPLOYMENT FLOW

1. Engineer configures intersection
2. System generates config
3. Config signed
4. Sent to controller
5. Controller verifies
6. Controller runs

---

# 12. FAILSAFE

If failure:

* switch to safe mode
* all-red if needed
* local control only

---

# 13. MULTI LANGUAGE

UI:

* Arabic
* French
* English

System:

* English only

---

# 14. UI REQUIREMENTS (IMPORTANT)

The UI MUST look like:

* Dark theme
* Map-centered dashboard
* Right-side control panels
* Real-time updates

---

# 15. MVP

* Map dashboard
* Intersection markers
* Basic backend
* Auth system
* Simulation mode

---

# 16. FINAL RULE

This system must be:

* production-ready
* scalable
* secure
* real-world usable

this is the key of google : AIzaSyDp4lPLnYLVm6O38RUwPTqx8LCDom_O3l0