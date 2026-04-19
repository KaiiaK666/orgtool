# Bert Ogden Dealer Work OS Manifest

## Purpose

This app is a lightweight internal workspace for Bert Ogden dealership teams.

The goal is not to overwhelm users with a giant CRM-style interface. The goal is:

- fast login
- clear personal dashboard
- simple projects
- groups inside those projects
- easy task editing
- strong color coding for priority and status
- optional custom fields added only when needed

## Primary workflow

1. User lands on the login screen.
2. User selects their profile.
3. User enters their own password.
4. User lands on their own dashboard.
5. User opens a project.
6. User works inside groups and tasks directly on the board.

## Core concepts

### Users

Each user logs into the same workspace but sees a personal dashboard centered on their assigned work.

Each user has their own unique password.

### Projects

Projects are the main containers. Examples:

- Showroom Appointments
- Service Lane Follow Up
- Used Car Specials

### Groups

Groups live inside projects. They should stay simple and human-readable, for example:

- Open
- This Week
- Done

### Tasks

Tasks are intentionally lightweight. The main task fields are:

- Task
- Priority
- Status
- Due Date
- Owner
- Notes

### Custom fields

Users can add extra fields directly inside a project by clicking `+ Add Field`.

Supported field types:

- Text
- Number
- Date
- Tag

This keeps the system flexible without making the default interface cluttered.

## UX rules

- Default to the fewest fields possible.
- Make creation fast.
- Keep actions visible and obvious.
- Avoid burying common actions in settings.
- Let users add complexity only when they actually need it.

## Admin / settings side

The settings area is meant to stay light.

Current purpose:

- add users
- add rooftops
- explain how the workspace works
- hold deployment notes

It should not turn into a bulky back-office screen unless there is a clear operational need.

## Authentication

Default admin setup account:

```text
User: Kai Rivers
Password: bertogden
```

All other users should have their own unique password. For production, replace local password storage with real auth and proper hashing.

## Deployment direction

Recommended production subdomain:

```text
organize.bertogden123.com
```

Reason:

- `app.bertogden123.com` is already used by the dealership scheduling app
- `organize.bertogden123.com` keeps this tool clearly separate
- the name matches the product purpose well

## Immediate next production steps

1. Move the password into an environment variable.
2. Replace local JSON storage with a real database.
3. Add persistent user auth.
4. Add backups and audit logging.
5. Deploy frontend and backend behind the production domain.
6. Point `organize.bertogden123.com` to the deployed frontend.
7. Restrict backend CORS to the production host.

## Current state

This build is intended to be close to a launchable internal MVP:

- login flow exists
- personal dashboard exists
- projects, groups, and tasks exist
- inline editing exists
- add-field workflow exists
- admin/settings basics exist

It is not yet the final production version until auth, data storage, and deployment are hardened.
