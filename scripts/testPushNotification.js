/* eslint-disable no-console */
const token = process.argv[2];

if (!token) {
  console.error("Usage: node scripts/testPushNotification.js ExponentPushToken[xxx]");
  process.exit(1);
}

async function main() {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      title: "Test Push Notification",
      body: "Push is working from KTL backend script.",
      data: { type: "test_push", source: "script" },
      sound: "default",
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    console.error("Push API error:", result);
    process.exit(1);
  }

  console.log("Push API response:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Failed to send push notification:", err?.message || err);
  process.exit(1);
});
