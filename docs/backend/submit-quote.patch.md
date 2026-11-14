# Изменения в Edge Function `submit-quote` (проект Supabase «Admiral Express»)

Нужны, чтобы форма «Вызвать курьера» работала без обязательного email и передавала город, адрес и день забора отдельными полями. Старые формы (EN, HE) продолжают работать без изменений.

1. После строки `const consent = ...` добавить:

```ts
  const isPickup = body.kind === "pickup";
  const pickup_city = clean(body.pickup_city, 80) || null;
  const pickup_address = clean(body.pickup_address, 200) || null;
  const rawDate = clean(body.pickup_date, 10);
  const todayIL = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const maxDate = new Date(Date.parse(todayIL) + 45 * 864e5).toISOString().slice(0, 10);
  const pickup_date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate >= todayIL && rawDate <= maxDate ? rawDate : null;
  const priceNum = Number(body.estimated_price);
  const estimated_price = body.estimated_price != null && Number.isFinite(priceNum) && priceNum > 0 && priceNum < 100000 ? priceNum : null;
```

2. Строку `const language = ...` заменить на:

```ts
  const language = body.language === "en" ? "en" : body.language === "he" ? "he" : "ru";
```

3. Проверку обязательных полей заменить на:

```ts
  const emailOk = email ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) : isPickup;
  if (!customer_name || !phone || !destination || !consent || !emailOk ||
      !Number.isFinite(weight_kg) || weight_kg <= 0 || weight_kg > 1000 ||
      (isPickup && (!pickup_city || !pickup_address))) {
    return response({ error: "Please check the required fields." }, 400, origin);
  }
```

4. В `insert` добавить поля: `pickup_city, pickup_address, pickup_date, estimated_price`.

5. В письмо-уведомление (массив `details`) добавить строки:

```ts
      ["Город забора", pickup_city], ["Адрес забора", pickup_address], ["Желаемый день", pickup_date], ["Оценка, ₪", estimated_price],
```

а `reply_to: email` заменить на `...(email ? { reply_to: email } : {})`.

6. Последний `return` заменить, чтобы сайт показал клиенту номер заявки:

```ts
  const request_number = savedQuote?.request_number == null ? null : "ADM-" + String(savedQuote.request_number).padStart(6, "0");
  return response({ ok: true, request_number, message: language === "en" ? "Thank you. Your request has been sent to our team." : "Спасибо! Заявка отправлена нашей команде." }, 201, origin);
```
