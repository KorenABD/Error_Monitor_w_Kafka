 Error Monitor (With kafka)
 Kafka itself working but the server isn't fully working with it and could not fix in time.
 
What it does

Track errors in your applications
Login system with user accounts
Resolve errors with comments
Filter by categories (database, API, security, etc.)
Message queue for real-time notifications

How to run
bash# 1. Start everything
docker-compose up --build

# 2. Wait 60 seconds for Kafka to start

# 3. Open browser
http://localhost:3000

That's it! 🎉
What you get

Login page at http://localhost:3000
Dashboard to create and manage errors
PostgreSQL database (saves your data)
Apache Kafka (sends messages when errors happen)

Stop it
bashdocker-compose down
