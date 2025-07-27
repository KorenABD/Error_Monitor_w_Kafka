const { Kafka } = require('kafkajs');

class KafkaService {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'error-monitor-app',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      connectionTimeout: 3000,
      requestTimeout: 30000,
      retry: {
        initialRetryTime: 1000,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2
      }
    });

    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: false,
      transactionTimeout: 30000
    });

    this.consumer = this.kafka.consumer({
      groupId: 'error-monitor-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 5000
    });

    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 10;

    this.topics = {
      ERRORS: 'error-events',
      NOTIFICATIONS: 'notification-events',
      ANALYTICS: 'analytics-events'
    };
  }

  async connect() {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.log('🔴 Max Kafka connection attempts reached. Operating without Kafka.');
      return;
    }

    this.connectionAttempts++;

    try {
      console.log(`🔄 Connecting to Kafka (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
      console.log(`📡 Kafka brokers: ${process.env.KAFKA_BROKERS || 'localhost:9092'}`);

      // Test connection by getting metadata
      const admin = this.kafka.admin();
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();

      // Connect producer
      await this.producer.connect();
      console.log('✅ Kafka producer connected');

      // Connect consumer
      await this.consumer.connect();
      console.log('✅ Kafka consumer connected');

      // Subscribe to topics
      await this.consumer.subscribe({
        topics: Object.values(this.topics),
        fromBeginning: false
      });

      this.isConnected = true;
      this.connectionAttempts = 0; // Reset on successful connection
      console.log('✅ Kafka connected successfully');

      // Start consuming messages
      this.startConsumer();

    } catch (error) {
      console.error(`❌ Kafka connection failed (attempt ${this.connectionAttempts}):`, error.message);

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const retryDelay = Math.min(this.connectionAttempts * 2000, 10000);
        console.log(`⏳ Retrying Kafka connection in ${retryDelay / 1000} seconds...`);
        setTimeout(() => this.connect(), retryDelay);
      } else {
        console.log('🔴 Kafka connection failed permanently. Continuing without message queue.');
      }
    }
  }

  async disconnect() {
    try {
      if (this.producer) {
        await this.producer.disconnect();
      }
      if (this.consumer) {
        await this.consumer.disconnect();
      }
      this.isConnected = false;
      console.log('📴 Kafka disconnected');
    } catch (error) {
      console.error('Error disconnecting from Kafka:', error);
    }
  }

  // Publish error event
  async publishError(errorData) {
    if (!this.isConnected) {
      console.log('⚠️  Kafka not connected, skipping error event publish');
      return;
    }

    try {
      const message = {
        topic: this.topics.ERRORS,
        messages: [{
          key: errorData.id,
          value: JSON.stringify({
            ...errorData,
            timestamp: new Date().toISOString(),
            eventType: 'ERROR_CREATED'
          })
        }]
      };

      await this.producer.send(message);
      console.log(`📤 Error event published: ${errorData.message}`);
    } catch (error) {
      console.error('Failed to publish error event:', error.message);
    }
  }

  // Publish error resolution
  async publishErrorResolution(errorData) {
    if (!this.isConnected) {
      console.log('⚠️  Kafka not connected, skipping resolution event publish');
      return;
    }

    try {
      const message = {
        topic: this.topics.ERRORS,
        messages: [{
          key: errorData.id,
          value: JSON.stringify({
            ...errorData,
            timestamp: new Date().toISOString(),
            eventType: 'ERROR_RESOLVED'
          })
        }]
      };

      await this.producer.send(message);
      console.log(`📤 Error resolution published: ${errorData.id}`);
    } catch (error) {
      console.error('Failed to publish error resolution:', error.message);
    }
  }

  // Publish notification
  async publishNotification(notification) {
    if (!this.isConnected) {
      console.log('⚠️  Kafka not connected, skipping notification publish');
      return;
    }

    try {
      const message = {
        topic: this.topics.NOTIFICATIONS,
        messages: [{
          value: JSON.stringify({
            ...notification,
            timestamp: new Date().toISOString()
          })
        }]
      };

      await this.producer.send(message);
      console.log(`📤 Notification published: ${notification.type}`);
    } catch (error) {
      console.error('Failed to publish notification:', error.message);
    }
  }

  // Start consuming messages
  async startConsumer() {
    try {
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const data = JSON.parse(message.value.toString());
            console.log(`📥 Received message from ${topic}:`, data.eventType || data.type);

            // Handle different message types
            switch (topic) {
              case this.topics.ERRORS:
                await this.handleErrorEvent(data);
                break;
              case this.topics.NOTIFICATIONS:
                await this.handleNotificationEvent(data);
                break;
              case this.topics.ANALYTICS:
                await this.handleAnalyticsEvent(data);
                break;
            }
          } catch (error) {
            console.error('Error processing message:', error.message);
          }
        },
      });
    } catch (error) {
      console.error('Error starting Kafka consumer:', error.message);
      this.isConnected = false;

      // Try to reconnect
      setTimeout(() => this.connect(), 5000);
    }
  }

  // Handle error events
  async handleErrorEvent(data) {
    switch (data.eventType) {
      case 'ERROR_CREATED':
        console.log(`🚨 Processing new error: ${data.message}`);

        // Check if it's a critical error
        if (data.severity === 'critical') {
          await this.publishNotification({
            type: 'CRITICAL_ERROR_ALERT',
            errorId: data.id,
            message: `Critical error detected: ${data.message}`,
            severity: data.severity,
            category: data.category
          });
        }
        break;

      case 'ERROR_RESOLVED':
        console.log(`✅ Error resolved: ${data.id}`);

        // Publish analytics event
        await this.publishAnalytics({
          type: 'ERROR_RESOLUTION',
          errorId: data.id,
          category: data.category,
          severity: data.severity,
          resolutionTime: data.resolved_at
        });
        break;
    }
  }

  // Handle notification events
  async handleNotificationEvent(data) {
    console.log(`🔔 Processing notification: ${data.type}`);

    switch (data.type) {
      case 'CRITICAL_ERROR_ALERT':
        console.log(`🚨 CRITICAL ALERT: ${data.message}`);
        // Could integrate with email, Slack, etc.
        break;
    }
  }

  // Handle analytics events
  async handleAnalyticsEvent(data) {
    console.log(`📊 Processing analytics: ${data.type}`);
    // Could update metrics, dashboards, etc.
  }

  // Publish analytics event
  async publishAnalytics(analyticsData) {
    if (!this.isConnected) return;

    try {
      const message = {
        topic: this.topics.ANALYTICS,
        messages: [{
          value: JSON.stringify({
            ...analyticsData,
            timestamp: new Date().toISOString()
          })
        }]
      };

      await this.producer.send(message);
      console.log(`📊 Analytics event published: ${analyticsData.type}`);
    } catch (error) {
      console.error('Failed to publish analytics event:', error.message);
    }
  }
}

module.exports = new KafkaService();