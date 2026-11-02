export function providerError(status, code, type='', detail='') {
 if(['insufficient_quota','organization_usage_limit_exceeded','billing_hard_limit_reached'].includes(code)||type==='insufficient_quota')return {code:'insufficient_quota',message:'OpenAI: исчерпана квота API или не подключена оплата. Проверьте Billing в OpenAI Platform; подписка ChatGPT не оплачивает API.'};
 if(status===401)return {code:'authentication_failed',message:'OpenAI отклонил API-ключ. Проверьте значение OPENAI_API_KEY в Supabase: ключ целиком, без кавычек и пробелов.'};
 if(code==='model_not_found')return {code:'model_not_found',message:'OpenAI: указанная модель не найдена или недоступна этому проекту. Требуется проверить OPENAI_MODEL и доступ проекта.'};
 if(status===403)return {code:'access_denied',message:'OpenAI запретил запрос. Проверьте права ключа на Responses API и ограничения проекта.'};
 if(status===429&&/tokens per min|tokens per minute|\bTPM\b/i.test(detail))return {code:'token_rate_limit',message:'OpenAI: превышен лимит токенов (объёма текста). Проверьте лимит TPM для gpt-4.1-mini в разделе Limits проекта.'};
 if(status===429&&/requests per day|\bRPD\b/i.test(detail))return {code:'daily_rate_limit',message:'OpenAI: исчерпан суточный лимит запросов. Проверьте Limits проекта.'};
 if(status===429)return {code:'rate_limit',message:'OpenAI: превышен лимит запросов. Подождите немного и повторите.'};
 if(status===400)return {code:'invalid_request',message:'OpenAI отклонил формат запроса. Нужна проверка серверного кода; ключ пока не меняйте.'};
 return {code:'provider_unavailable',message:'OpenAI временно недоступен. Повторите попытку позже.'};
}
