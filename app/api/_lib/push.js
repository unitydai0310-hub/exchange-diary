let configured = false;

function hasPushEnv() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

async function getWebPush() {
  if (!hasPushEnv()) return null;
  const webpush = (await import('web-push')).default;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
  }
  return webpush;
}

function uniqueSubscriptions(list) {
  const map = new Map();
  for (const sub of list) {
    if (!sub?.endpoint) continue;
    map.set(sub.endpoint, sub);
  }
  return Array.from(map.values());
}

export async function sendPushToSubscriptions(subscriptions, payload) {
  const webpush = await getWebPush();
  if (!webpush) return;

  const body = JSON.stringify(payload);
  const unique = uniqueSubscriptions(subscriptions);

  await Promise.all(
    unique.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, body);
      } catch {
        // Ignore failed endpoints. Cleanup can be added later.
      }
    })
  );
}

export async function notifyNewEntry(room, entry) {
  const subscriptions = [];
  const pushMap = room.pushSubscriptions || {};

  for (const [nickname, list] of Object.entries(pushMap)) {
    if (nickname === entry.author) continue;
    if (!Array.isArray(list)) continue;
    subscriptions.push(...list);
  }

  await sendPushToSubscriptions(subscriptions, {
    title: `${room.name} に新しい日記`,
    body: `${entry.author} さんが ${entry.date} の日記を投稿しました`,
    url: `/?room=${room.code}`
  });
}

export async function notifyLotteryWinners(room, date, winners) {
  const pushMap = room.pushSubscriptions || {};
  const subscriptions = [];

  for (const winner of winners) {
    const list = pushMap[winner];
    if (Array.isArray(list)) {
      subscriptions.push(...list);
    }
  }

  await sendPushToSubscriptions(subscriptions, {
    title: `${room.name} の担当抽選`,
    body: `${date} の担当に選ばれました`,
    url: `/?room=${room.code}`
  });
}

export function getPublicVapidKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}
