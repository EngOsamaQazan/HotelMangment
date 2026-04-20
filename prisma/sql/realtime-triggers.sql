-- =============================================================================
-- Realtime triggers: pg_notify on chat/task/notification writes
-- =============================================================================
-- Run this AFTER `prisma db push` to set up the LISTEN/NOTIFY bus that the
-- realtime Socket.IO service subscribes to.
--
-- Usage (on the production server):
--   psql "$DATABASE_URL" -f prisma/sql/realtime-triggers.sql
--
-- Re-running is safe: all DROP statements use IF EXISTS.
-- =============================================================================

-- ---------- chat_messages ----------
CREATE OR REPLACE FUNCTION notify_chat_message() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  IF TG_OP = 'INSERT' THEN
    payload := json_build_object(
      'op', 'insert',
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'senderId', NEW.sender_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    payload := json_build_object(
      'op', CASE WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'delete' ELSE 'update' END,
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'senderId', NEW.sender_id
    );
  END IF;
  PERFORM pg_notify('chat_events', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_messages_notify ON chat_messages;
CREATE TRIGGER chat_messages_notify
  AFTER INSERT OR UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_message();

-- ---------- chat_reactions ----------
CREATE OR REPLACE FUNCTION notify_chat_reaction() RETURNS trigger AS $$
DECLARE
  payload json;
  msg_conv_id int;
BEGIN
  SELECT conversation_id INTO msg_conv_id FROM chat_messages
    WHERE id = COALESCE(NEW.message_id, OLD.message_id);
  payload := json_build_object(
    'op', CASE WHEN TG_OP = 'INSERT' THEN 'add' ELSE 'remove' END,
    'conversationId', msg_conv_id,
    'messageId', COALESCE(NEW.message_id, OLD.message_id),
    'emoji', COALESCE(NEW.emoji, OLD.emoji),
    'userId', COALESCE(NEW.user_id, OLD.user_id)
  );
  PERFORM pg_notify('chat_reaction_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_reactions_notify ON chat_reactions;
CREATE TRIGGER chat_reactions_notify
  AFTER INSERT OR DELETE ON chat_reactions
  FOR EACH ROW EXECUTE FUNCTION notify_chat_reaction();

-- ---------- chat_participants (read receipts) ----------
CREATE OR REPLACE FUNCTION notify_chat_read() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  IF NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    payload := json_build_object(
      'op', 'read',
      'conversationId', NEW.conversation_id,
      'userId', NEW.user_id,
      'lastReadAt', NEW.last_read_at
    );
    PERFORM pg_notify('chat_read_events', payload::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_participants_read_notify ON chat_participants;
CREATE TRIGGER chat_participants_read_notify
  AFTER UPDATE ON chat_participants
  FOR EACH ROW EXECUTE FUNCTION notify_chat_read();

-- ---------- tasks ----------
CREATE OR REPLACE FUNCTION notify_task_event() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  IF TG_OP = 'INSERT' THEN
    payload := json_build_object(
      'op', 'create',
      'boardId', NEW.board_id,
      'columnId', NEW.column_id,
      'taskId', NEW.id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    payload := json_build_object(
      'op', CASE WHEN NEW.column_id IS DISTINCT FROM OLD.column_id THEN 'move' ELSE 'update' END,
      'boardId', NEW.board_id,
      'columnId', NEW.column_id,
      'oldColumnId', OLD.column_id,
      'taskId', NEW.id
    );
  ELSIF TG_OP = 'DELETE' THEN
    payload := json_build_object(
      'op', 'delete',
      'boardId', OLD.board_id,
      'taskId', OLD.id
    );
  END IF;
  PERFORM pg_notify('task_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_notify ON tasks;
CREATE TRIGGER tasks_notify
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_event();

-- ---------- notifications ----------
CREATE OR REPLACE FUNCTION notify_new_notification() RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload := json_build_object(
    'op', 'insert',
    'userId', NEW.user_id,
    'notificationId', NEW.id
  );
  PERFORM pg_notify('notif_events', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notifications_notify ON notifications;
CREATE TRIGGER notifications_notify
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_new_notification();
