#!/bin/bash

set -euo pipefail

# Summit Staffing Backend Test Script
# Usage:
#   bash scripts/test-backend.sh [API_URL]
# Example:
#   bash scripts/test-backend.sh http://localhost:3000

API_URL="${1:-http://localhost:3000}"

echo "Testing Summit Staffing Backend at $API_URL"
echo ""

# Test 1: Health check
echo "Test 1: Health check..."
if curl -s "$API_URL/" > /dev/null; then
  echo "Server is responding"
else
  echo "Server is down"
  exit 1
fi

# Test 2: Register worker
echo "Test 2: Register worker..."
WORKER_EMAIL="test.worker.$RANDOM@test.com"
WORKER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"'$WORKER_EMAIL'","password":"Test123!@#","role":"worker","firstName":"Test","lastName":"Worker","phone":"0400000000","abn":"12345678901"}')

if echo "$WORKER_RESPONSE" | grep -q '"token"'; then
  echo "Worker registration successful"
  WORKER_TOKEN=$(echo "$WORKER_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
else
  echo "Worker registration failed"
  echo "$WORKER_RESPONSE"
fi

# Test 3: Register participant
echo "Test 3: Register participant..."
PARTICIPANT_EMAIL="test.participant.$RANDOM@test.com"
PARTICIPANT_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"'$PARTICIPANT_EMAIL'","password":"Test123!@#","role":"participant","firstName":"Test","lastName":"Participant","phone":"0400111222","ndisNumber":"4300123456"}')

if echo "$PARTICIPANT_RESPONSE" | grep -q '"token"'; then
  echo "Participant registration successful"
  PARTICIPANT_TOKEN=$(echo "$PARTICIPANT_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
else
  echo "Participant registration failed"
  echo "$PARTICIPANT_RESPONSE"
fi

# Test 4: Login (worker)
echo "Test 4: Login test (worker)..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"'$WORKER_EMAIL'","password":"Test123!@#"}')

if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
  echo "Worker login successful"
else
  echo "Worker login failed"
  echo "$LOGIN_RESPONSE"
fi

echo ""
echo "Basic tests complete!"
echo ""
echo "Next: extend this script with additional booking/payment/search tests once endpoints are finalized."
