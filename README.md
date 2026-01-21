# Team Media Hub

## Backend local testing
1. Create `backend/.env` with your AWS creds and table names.
2. Start dev server:
   ```bash
   cd backend/src
   python3 dev_server.py
   ```
3. In another terminal, run tests:
   ```bash
   cd backend
   python3 test_api.py
   ```

## Frontend
```bash
cd frontend
npm install
npm run dev
```
