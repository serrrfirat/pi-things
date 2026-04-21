---
name: apple-reminders-integration
description: Integrate Apple Reminders with Claude Code for life admin automation. Use when managing personal reminders, creating tasks from insights, reading reminder lists, or automating life admin workflows. Triggers include reminders, tasks, to-do, life admin, haircut, bottles, errands, appointments.
---

# Apple Reminders Integration

Seamlessly integrate Apple Reminders with your AI workflow. Read, create, complete, and manage reminders directly from Claude Code using AppleScript or MCP server integration.

## Quick Start

### Read All Reminder Lists

```bash
osascript -e 'tell application "Reminders" to get name of every list'
```

### Get Reminders from a Specific List

```bash
osascript -e 'tell application "Reminders" to get name of every reminder in list "Reminders"'
```

### Create a New Reminder

```bash
osascript -e 'tell application "Reminders"
  tell list "Reminders"
    make new reminder with properties {name:"Task name here", body:"Optional notes"}
  end tell
end tell'
```

## Integration Methods

### Method 1: Direct AppleScript (Recommended for Quick Use)

Use AppleScript via `osascript` for immediate integration without setup:

```bash
# List all reminder lists
osascript -e 'tell application "Reminders" to get name of every list'

# Get incomplete reminders from a list
osascript -e 'tell application "Reminders"
  set output to ""
  repeat with r in (reminders in list "Reminders" whose completed is false)
    set output to output & name of r & "\n"
  end repeat
  return output
end tell'

# Create reminder with due date (format: MM/DD/YYYY HH:MM AM/PM)
osascript -e 'tell application "Reminders"
  tell list "Reminders"
    make new reminder with properties {name:"Buy groceries", due date:date "01/15/2026 5:00 PM"}
  end tell
end tell'

# Mark reminder as complete
osascript -e 'tell application "Reminders"
  set r to (first reminder in list "Reminders" whose name is "Buy groceries")
  set completed of r to true
end tell'
```

### Method 2: MCP Server (Recommended for Full Integration)

Install the Apple Reminders MCP server for Claude Desktop/Claude Code:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/shadowfax92/apple-reminders-mcp.git
   cd apple-reminders-mcp
   npm install
   npm run build
   ```

2. **Configure Claude Desktop** (`claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "apple-reminders": {
         "command": "node",
         "args": ["/path/to/apple-reminders-mcp/dist/index.js"]
       }
     }
   }
   ```

3. **Available MCP Tools:**
   - `getLists` - Get all reminder lists
   - `getReminders(listName)` - Get reminders from a list
   - `createReminder(listName, title, dueDate?, notes?)` - Create reminder
   - `completeReminder(listName, reminderName)` - Mark complete
   - `deleteReminder(listName, reminderName)` - Delete reminder

### Method 3: IFTTT Integration (For Cross-Platform)

Connect Apple Reminders to external services:

1. Set up IFTTT with iOS Reminders integration
2. Create applets:
   - "New reminder added" → Trigger webhook/action
   - "Reminder completed" → Log to spreadsheet
3. Polling frequency: 5 minutes (Pro) or 1 hour (Free)

## Workflow Recipes

### Recipe 1: Daily Life Admin Review

Review all pending reminders for context in your AI workflow:

```bash
# Get all incomplete reminders with their lists
osascript -e 'tell application "Reminders"
  set output to ""
  repeat with l in every list
    set listName to name of l
    repeat with r in (reminders in l whose completed is false)
      set output to output & listName & ": " & name of r & "\n"
    end repeat
  end repeat
  return output
end tell'
```

### Recipe 2: Insight-to-Reminder Pipeline

When Claude identifies an actionable insight, create a reminder:

```bash
# Create reminder from AI insight
TASK="Schedule dentist appointment - AI suggested based on calendar gap"
LIST="Health"
DUE_DATE="01/20/2026 9:00 AM"

osascript -e "tell application \"Reminders\"
  tell list \"$LIST\"
    make new reminder with properties {name:\"$TASK\", due date:date \"$DUE_DATE\"}
  end tell
end tell"
```

### Recipe 3: Reminder-Triggered Context

Pull reminders into your AI context for relevant suggestions:

```bash
# Get reminders due today
osascript -e 'tell application "Reminders"
  set today to current date
  set time of today to 0
  set tomorrow to today + (1 * days)
  set output to ""
  repeat with l in every list
    repeat with r in (reminders in l whose completed is false and due date ≥ today and due date < tomorrow)
      set output to output & name of r & " (due: " & (due date of r as string) & ")\n"
    end repeat
  end repeat
  return output
end tell'
```

### Recipe 4: Batch Import Tasks

Import multiple tasks from a text file or AI-generated list:

```bash
# Create multiple reminders from array
TASKS=("Wash baby bottles" "Haircut appointment" "Order electric toothbrush")
LIST="Personal"

for task in "${TASKS[@]}"; do
  osascript -e "tell application \"Reminders\"
    tell list \"$LIST\"
      make new reminder with properties {name:\"$task\"}
    end tell
  end tell"
done
```

## Reminder Properties Reference

When creating or modifying reminders via AppleScript:

| Property | Type | Description |
|----------|------|-------------|
| `name` | text | Reminder title (required) |
| `body` | text | Notes/description |
| `completed` | boolean | Completion status |
| `due date` | date | When the reminder is due |
| `remind me date` | date | When to show alert |
| `priority` | integer | Priority level (0=none, 1=high, 5=medium, 9=low) |
| `completion date` | date | When marked complete (read-only) |

**Date Format:** `MM/DD/YYYY HH:MM AM/PM` (e.g., "01/15/2026 3:00 PM")

## Synapse Integration Ideas

### Trigger Insights from Reminders

1. **Morning Briefing**: Pull today's reminders into Synapse context
2. **Pattern Detection**: Analyze recurring reminder types for life admin insights
3. **Smart Scheduling**: Use screen time data to suggest optimal reminder times

### Create Reminders from Insights

1. **Action Items**: Convert AI recommendations to reminders
2. **Follow-ups**: Create reminders for deferred decisions
3. **Health/Wellness**: Auto-create reminders from health-related insights

### Bidirectional Workflow Example

```bash
# 1. Read reminders into context
CONTEXT=$(osascript -e 'tell application "Reminders" to get name of every reminder in list "Life Admin" whose completed is false')

# 2. AI processes context and generates insight
# (This happens in Claude/Synapse)

# 3. Create follow-up reminder from insight
osascript -e 'tell application "Reminders"
  tell list "AI Follow-ups"
    make new reminder with properties {name:"Review meal prep options - suggested by AI", due date:date "01/16/2026 10:00 AM"}
  end tell
end tell'
```

## Permissions Setup

First-time use requires macOS permissions:

1. Run any AppleScript command
2. macOS will prompt: "Terminal wants to control Reminders"
3. Click "OK" to allow
4. Review permissions: **System Settings → Privacy & Security → Automation**

## Limitations

- **Tags**: AppleScript cannot read/write tags (workaround: include in body text)
- **Groups**: Newer reminder groups aren't accessible via AppleScript
- **Subtasks**: Limited support for nested tasks
- **Attachments**: Cannot add images/files via AppleScript

## Best Practices

1. **Use Descriptive List Names**: Organize reminders into lists like "Life Admin", "Health", "Work", "AI Follow-ups"
2. **Include Context in Body**: Since tags aren't scriptable, add context as notes
3. **Set Realistic Due Dates**: Use the remind me date for alerts separate from due dates
4. **Batch Operations**: Group multiple reminder operations to avoid repeated app launches
5. **Error Handling**: Wrap AppleScript in try blocks for production workflows

## Example: Complete Life Admin Workflow

```bash
#!/bin/bash
# life-admin-sync.sh - Sync reminders with AI workflow

# 1. Export current reminders to file
osascript -e 'tell application "Reminders"
  set output to ""
  repeat with r in (reminders in list "Life Admin" whose completed is false)
    set output to output & name of r & "|" & (body of r) & "\n"
  end repeat
  return output
end tell' > /tmp/current_reminders.txt

# 2. Mark specific reminder complete
COMPLETED_TASK="Wash baby bottles"
osascript -e "tell application \"Reminders\"
  set r to (first reminder in list \"Life Admin\" whose name is \"$COMPLETED_TASK\")
  set completed of r to true
end tell"

# 3. Add new AI-suggested task
osascript -e 'tell application "Reminders"
  tell list "Life Admin"
    make new reminder with properties {name:"Restock diapers - AI noticed pattern", body:"Based on 2-week purchase cycle", due date:date "01/18/2026 10:00 AM"}
  end tell
end tell'

echo "Life admin sync complete!"
```

## Resources

- [Apple Reminders MCP Server](https://github.com/shadowfax92/apple-reminders-mcp)
- [AppleScript Reminders Examples](https://gist.github.com/n8henrie/c3a5bf270b8200e33591)
- [EventKit Framework](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders)
- [IFTTT iOS Reminders](https://ifttt.com/ios_reminders)
- [Pushcut Automation](https://www.pushcut.io/support/automation-server)
