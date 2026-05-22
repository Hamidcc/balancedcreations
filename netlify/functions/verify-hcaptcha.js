exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let token;
  try {
    ({ token } = JSON.parse(event.body));
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid body" }),
    };
  }

  if (!token) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing token" }),
    };
  }

  const SECRET = process.env.HCAPTCHA_SECRET;

  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(SECRET)}&response=${encodeURIComponent(token)}`,
    });

    const data = await res.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: data.success,
        errors: data["error-codes"] || [],
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Verification unavailable" }),
    };
  }
};
