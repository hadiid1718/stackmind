# StackMind Frontend

React 18 + Vite frontend scaffold using JavaScript with Tailwind CSS and modular domain structure.

## Stack

- React 18 + Vite
- JavaScript (ESM)
- Tailwind CSS
- Lucide-react
- Zustand
- React Query v5
- Axios
- Socket.io-client
- React Hook Form + Zod
- React Router v6

## Quick Start

```bash
npm install
npm run dev
```

## Project Structure

```text
src/
  components/  (Button, Input, Modal, Card, Badge, Spinner, Sidebar, TopBar)
  pages/       (Auth, Dashboard, Query, Integrations, Graph, Notifications, Billing, Settings)
  hooks/       (useAuth, useOrg, useQuery, useNotifications, useBilling, useGraph)
  services/    (authService, orgService, ingestionService, graphService, queryService, notifService, billingService, gatewayService)
  store/       (authStore, orgStore, uiStore, notifStore, billingStore)
  lib/         (axios, dateFormatters, sse-client, socket-client)
  types/       (User, Org, Event, GraphNode, QueryResult, Notification, Subscription)
```

## Environment Variables

Set these in a `.env` file if your backend runs on a custom URL:

```bash
VITE_API_BASE_URL=http://localhost:4001/api/v1
VITE_SOCKET_URL=http://localhost:4001
```
