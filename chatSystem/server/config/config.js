module.exports = {
  protocol: "https",
  port: process.env.PORT || 8000,
  cert_path: "/var/run/secrets/chat_ssl_cert",
  cert_key_path: "/var/run/secrets/chat_ssl_key",
  ca_cert_path: "/var/run/secrets/chat_ssl_intermediate_cert",
  jwt_secret: "secret",
  web_domain: process.env.CHAT_SERVICE_URL,
  redis_url: rUrl,
  redis_port: rPort,
  redis_passwd: rPass
};
