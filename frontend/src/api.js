const DEFAULT_API_BASE = "http://localhost:8124";

export const apiBase = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

export function getBootstrap() {
  return request("/api/bootstrap");
}

export function login(payload) {
  return request("/api/login", { method: "POST", body: JSON.stringify(payload) });
}

export function createStore(payload) {
  return request("/api/stores", { method: "POST", body: JSON.stringify(payload) });
}

export function updateStore(storeId, payload) {
  return request(`/api/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function createUser(payload) {
  return request("/api/users", { method: "POST", body: JSON.stringify(payload) });
}

export function updateUser(userId, payload) {
  return request(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function createAnnouncement(payload) {
  return request("/api/announcements", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAnnouncement(announcementId, payload) {
  return request(`/api/announcements/${announcementId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function updatePermission(role, payload) {
  return request(`/api/settings/permissions/${encodeURIComponent(role)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createBoard(payload) {
  return request("/api/boards", { method: "POST", body: JSON.stringify(payload) });
}

export function updateBoard(boardId, payload) {
  return request(`/api/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function createBoardField(boardId, payload) {
  return request(`/api/boards/${boardId}/fields`, { method: "POST", body: JSON.stringify(payload) });
}

export function createGroup(payload) {
  return request("/api/groups", { method: "POST", body: JSON.stringify(payload) });
}

export function createTask(payload) {
  return request("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
}

export function updateTask(boardId, taskId, payload) {
  return request(`/api/boards/${boardId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
}
