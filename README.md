# Containerized 3-Tier Application with Nginx Reverse Proxy & Full-Stack Observability

![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)

A production-modeled, **8-container DevOps project** orchestrated with **Docker Compose**. This project deploys a complete **3-Tier Web Application** (Frontend UI, Node.js/Express REST API, and MongoDB) behind an **Nginx Reverse Proxy**, enforces strict **Docker Bridge Network Isolation**, and integrates a **Declarative Observability Stack** using **Prometheus**, **Node Exporter**, **cAdvisor**, and **Grafana**.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Understanding the 3-Tier & Supporting Layers](#2-understanding-the-3-tier--supporting-layers)
3. [Network Segmentation & Security Model](#3-network-segmentation--security-model)
4. [DevOps & Security Best Practices Implemented](#4-devops--security-best-practices-implemented)
5. [Project Directory Structure](#5-project-directory-structure)
6. [Getting Started (Installation & Deployment)](#6-getting-started-installation--deployment)
7. [Verification & Security Testing Guide](#7-verification--security-testing-guide)
8. [Observability & Grafana Dashboards](#8-observability--grafana-dashboards)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Troubleshooting Common Issues](#10-troubleshooting-common-issues)

---

## 1. Architecture Overview


```text
                        [ User Browser (HTTP :80) ]
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │           nginx-proxy           │
                    │   Reverse Proxy (Port 80:80)    │
                    └────────────────┬────────────────┘
                                     │
        ┌────────────────────────────┴────────────────────────────┐
        │                  (public-net bridge)                    │
        ▼ (Routes: /)                                             ▼ (Routes: /api/*)
┌───────────────────┐                                   ┌───────────────────┐
│   app-frontend    │                                   │    app-backend    │
│ Nginx Alpine (:80)│                                   │ Node.js API(:5000)│
│  [Tier 1: UI]     │                                   │  [Tier 2: Logic]  │
└───────────────────┘                                   └─────────┬─────────┘
                                                                  │
                                                   (backend-net — Isolated)
                                                                  │
                                                                  ▼
                                                        ┌───────────────────┐
                                                        │    app-mongodb    │
                                                        │  MongoDB (:27017) │
                                                        │   [Tier 3: Data]  │
                                                        └─────────┬─────────┘
                                                                  │
                                                        (Volume: mongo-data)

=============================================================================
                  OBSERVABILITY PLANE (monitoring-net bridge)
=============================================================================
┌───────────────────────┐      ┌───────────────────────┐
│   mon-node-exporter   │      │     mon-cadvisor      │
│  Host Linux Metrics   │      │ Docker cgroup Metrics │
│   (Internal :9100)    │      │     (Port :8080)      │
└───────────┬───────────┘      └───────────┬───────────┘
            │                              │
            └──────────────┬───────────────┘
                           ▼ (Scrapes every 10s)
                 ┌───────────────────┐
                 │  mon-prometheus   │
                 │   TSDB (:9090)    │
                 └─────────┬─────────┘
                           │ (Auto-provisioned Datasource)
                           ▼
                 ┌───────────────────┐
                 │    mon-grafana    │
                 │ Dashboards (:3000)│
                 └───────────────────┘
```

---

## 2. Understanding the 3-Tier & Supporting Layers

### Application Tiers
| Tier | Container Name | Service Name | Technology | Role & Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Presentation** | `app-frontend` | `frontend` | HTML5, CSS, JS, `nginx:1.27-alpine` | Serves the user interface and triggers asynchronous `fetch()` calls to `/api/health` and `/api/tasks`. |
| **Tier 2: Application** | `app-backend` | `backend` | `node:20-alpine`, Express, Mongoose | Processes business logic, exposes REST endpoints on internal port `5000`, and communicates with MongoDB. |
| **Tier 3: Data** | `app-mongodb` | `mongodb` | `mongo:7` | Stores application documents persistently using the `mongo-data` Docker volume on internal port `27017`. |

### Edge & Observability Infrastructure
| Layer | Container Name | Service Name | Host Port | Role & Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Edge Proxy** | `nginx-proxy` | `nginx-proxy` | `80` | Single public entry point. Routes `/` to `frontend:80` and `/api/` to `backend:5000`. |
| **Host Sensor** | `mon-node-exporter` | `node-exporter` | *Internal (`9100`)* | Reads host-level Linux hardware and OS metrics from `/proc`, `/sys`, and `/` in read-only mode. |
| **Container Sensor** | `mon-cadvisor` | `cadvisor` | `8080` | Reads real-time per-container CPU, memory, filesystem, and network metrics from `/var/lib/docker`. |
| **Metrics TSDB** | `mon-prometheus` | `prometheus` | `9090` | Scrapes metrics from `node-exporter`, `cadvisor`, and itself every 10 seconds and stores time-series data. |
| **Visualization** | `mon-grafana` | `grafana` | `3000` | Connects automatically to Prometheus via provisioning-as-code (`datasource.yml`) to render dashboards. |

---

## 3. Network Segmentation & Security Model

Instead of placing all containers on a single flat default network, this project enforces **least-privilege network isolation** across three custom bridge networks:

1. **`public-net`**
   * **Connected Services:** `nginx-proxy`, `frontend`, `backend`
   * **Security Boundary:** Allows the Nginx Reverse Proxy to forward requests to the Frontend and Backend without exposing either container's internal ports to the host machine.
2. **`backend-net`**
   * **Connected Services:** `backend`, `mongodb`
   * **Security Boundary:** Completely isolates the MongoDB database. Neither `nginx-proxy` nor `frontend` is attached to `backend-net`. Even if the Frontend container were compromised, the attacker has no network route to reach or query the database.
3. **`monitoring-net`**
   * **Connected Services:** `prometheus`, `node-exporter`, `cadvisor`, `grafana`
   * **Security Boundary:** Keeps high-frequency metrics scraping traffic separated from user application traffic.

---

## 4. DevOps & Security Best Practices Implemented

* **Non-Root Container Execution:** The Node.js API container explicitly switches to a least-privilege user (`USER node`) before starting the server, preventing root privilege escalation inside the container.
* **Zero Direct Backend/Database Port Exposure:** Neither port `5000` (Express) nor port `27017` (MongoDB) is bound to the host machine; all external application traffic must pass through `nginx-proxy` on Port `80`.
* **Read-Only Configuration & System Mounts (`:ro`):** Configuration files (`default.conf`, `prometheus.yml`, `datasource.yml`) and host system directories (`/proc`, `/sys`, `/var/lib/docker`) are mounted with the `:ro` flag so containers cannot tamper with host files.
* **Declarative Grafana Provisioning:** Rather than configuring data sources manually through the UI, `monitoring/datasource.yml` is mounted into `/etc/grafana/provisioning/datasources/` so Grafana connects to Prometheus automatically on boot.
* **Stateful Persistence & Crash Recovery:** Named volumes (`mongo-data` and `grafana-data`) protect database records and dashboards across `docker compose down` cycles, while `restart: unless-stopped` ensures automatic recovery after crashes or host reboots.

---

## 5. Project Directory Structure

```text
devops-project-1/
├── backend/
│   ├── Dockerfile             # Multi-stage Node 20 Alpine build running as non-root USER node
│   ├── package.json           # Express and Mongoose production dependencies
│   └── server.js              # REST API (/api/health, /api/tasks) & MongoDB connection logic
├── frontend/
│   ├── Dockerfile             # Lightweight Nginx Alpine static file server
│   └── index.html             # Dashboard UI communicating via relative /api/* paths
├── nginx/
│   └── default.conf           # Reverse Proxy routing rules (/ -> frontend, /api/ -> backend)
├── monitoring/
│   ├── prometheus.yml         # Scrape configuration (10s interval) for Prometheus, Node Exporter & cAdvisor
│   └── datasource.yml         # Automated Grafana data source provisioning for Prometheus
├── docker-compose.yml         # Orchestrates all 8 services, 3 bridge networks, and 2 named volumes
├── .gitignore                 # Excludes node_modules, .env, and log files
└── README.md                  # Project documentation
```

---

## 6. Getting Started (Installation & Deployment)

### Prerequisites
* **OS:** Linux (Ubuntu/Debian recommended) or macOS/Windows with Docker Desktop
* **Docker Engine:** v24.0+
* **Docker Compose:** v2.20+ (`docker compose` plugin)

### Step-by-Step Deployment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Yasith-Nimsara/docker-3tier-monitoring-stack.git
   cd docker-3tier-monitoring-stack
   ```

2. **Build images and start all 8 containers in detached mode:**
   ```bash
   docker compose up -d --build
   ```

3. **Verify that all 8 containers are running:**
   ```bash
   docker compose ps
   ```

4. **Access the live interfaces:**
   * **Web Application (via Nginx Proxy):** [http://localhost](http://localhost)
   * **Backend Health Check (via Nginx Proxy):** [http://localhost/api/health](http://localhost/api/health)
   * **Prometheus UI & Targets:** [http://localhost:9090/targets](http://localhost:9090/targets)
   * **cAdvisor Container Metrics UI:** [http://localhost:8080](http://localhost:8080)
   * **Grafana Dashboards:** [http://localhost:3000](http://localhost:3000)
     * **Username:** `admin`
     * **Password:** `devopsadmin`

---

## 7. Verification & Security Testing Guide

Run the following verification tests to validate the architecture:

### Test 1: Verify Backend Port 5000 is Locked Down from the Host
```bash
curl http://localhost:5000/api/health
```
**Expected Output:** `curl: (7) Failed to connect to localhost port 5000: Connection refused` (proving traffic can only enter through the Nginx Reverse Proxy on Port 80).

### Test 2: Verify Network Isolation (`public-net` vs. `backend-net`)
Attempt to ping the `mongodb` container from inside the `app-frontend` container:
```bash
docker exec -it app-frontend ping -c 2 mongodb
```
**Expected Output:** `ping: bad address 'mongodb'` (Frontend is completely isolated from `backend-net`).

Now test connectivity from `app-backend`:
```bash
docker exec -it app-backend ping -c 2 mongodb
```
**Expected Output:** `64 bytes from ... (0% packet loss)` (Backend bridges `public-net` and `backend-net`).

### Test 3: Verify Non-Root Container Security
```bash
docker exec -it app-backend whoami
```
**Expected Output:** `node` (confirms the container is not running as `root`).

### Test 4: Verify Data Persistence Across Container Destruction
1. Add a task via the UI at `http://localhost` or via CLI:
   ```bash
   curl -X POST http://localhost/api/tasks \
     -H "Content-Type: application/json" \
     -d '{"title": "Verify persistent volume storage"}'
   ```
2. Destroy and recreate all containers:
   ```bash
   docker compose down
   docker compose up -d
   ```
3. Fetch tasks again:
   ```bash
   curl http://localhost/api/tasks
   ```
   **Expected Output:** Your saved tasks remain intact inside the `mongo-data` volume.

---

## 8. Observability & Grafana Dashboards

1. Log into Grafana at [http://localhost:3000](http://localhost:3000) (`admin` / `devopsadmin`).
2. Navigate to **Dashboards → New → Import**.
3. Import these two industry-standard community dashboards using the pre-configured **Prometheus** data source:
   * **Dashboard ID `1860` (Node Exporter Full):** Displays host Linux CPU load, memory usage, disk I/O, and network traffic.
   * **Dashboard ID `14282` (cAdvisor Docker Insights):** Displays per-container CPU usage, memory consumption, and network traffic across all 8 containers.

---

## 9. API Endpoints Reference

| Method | Endpoint | Routed By Nginx To | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | `http://frontend:80` | Serves the Frontend HTML/JS application. |
| `GET` | `/api/health` | `http://backend:5000/api/health` | Returns API status, MongoDB connection state, and container ID. |
| `GET` | `/api/tasks` | `http://backend:5000/api/tasks` | Returns the latest tasks stored in MongoDB sorted by timestamp. |
| `POST` | `/api/tasks` | `http://backend:5000/api/tasks` | Creates a new task in MongoDB (`{"title": "Your task"}`). |

---

## 10. Troubleshooting Common Issues

* **`error mounting ... not a directory: Are you trying to mount a directory onto a file`**
  * **Cause:** Running `docker compose up` before creating a bind-mounted configuration file (`nginx/default.conf`, `monitoring/prometheus.yml`, or `monitoring/datasource.yml`) causes Docker to create an empty directory at that path.
  * **Fix:** Stop the stack (`docker compose down`), remove the accidental directory (`sudo rm -rf nginx/default.conf`), create the file properly, and run `docker compose up -d`.
* **`Bind for 0.0.0.0:80 failed: port is already allocated`**
  * **Cause:** Another web server (such as a host `nginx` or `apache2` systemd service) is already using Port 80 on your machine.
  * **Fix:** Stop the host service (`sudo systemctl stop nginx`) or update `nginx-proxy` ports in `docker-compose.yml` to `"8088:80"`.

---
