var TOGGL_BASIC_AUTH = '???:api_token';
var GOOGLE_CALENDAR_ID = '???@group.calendar.google.com';

var COMPARE_STATUS = {
  MATCH: 0,    //If it equals both start_time, end_time & description.
  TOGGL_FASTER: 1,    //
  CALENDAR_FASTER: 2, //
  CHANGED_STATUS: 3,   //If it equals both start_time but different end_time or description. This incident should be cauesd by the change of toggl side.
}

function getTogglEntries(date)
{
  var uri = 'https://www.toggl.com/api/v8/time_entries' + '?start_date=' + date.toISOString();
  console.log("toggl request uri:" + uri);
  var response = UrlFetchApp.fetch(
    uri,
    {
      'method' : 'GET',
      'headers' : { "Authorization" : " Basic " + Utilities.base64Encode(TOGGL_BASIC_AUTH) },
      'muteHttpExceptions': true
    }
  );
  console.log("toggl response:"+response.getResponseCode());
  return response
}

function compareTogglAndCalendar(toggl_entry, calendar_event)
{
  var toggl_entry_start_time = new Date(toggl_entry.start).getTime()
  var calendar_event_start_time = calendar_event.getStartTime().getTime()
  Logger.log("start_time: toggl=%s, calendar=%s", toggl_entry.start, calendar_event.getStartTime().toISOString());
  if(toggl_entry_start_time == calendar_event_start_time)
  {
    Logger.log("start_time match");
    var toggl_entry_end_time = new Date(toggl_entry.stop).getTime()
    if(toggl_entry_end_time == calendar_event.getEndTime().getTime() && toggl_entry.description == calendar_event.getTitle())
    {
      Logger.log("match");
      return COMPARE_STATUS.MATCH;//all status are matched
    }
    else
    {
      Logger.log("changed_status");
      return COMPARE_STATUS.CHANGED_STATUS;
    }
  }
  else if(toggl_entry_start_time < calendar_event_start_time)
  {
    Logger.log("toggl faster");
    return COMPARE_STATUS.TOGGL_FASTER;
  }
  else if(toggl_entry_start_time > calendar_event_start_time)
  {
    Logger.log("calendar faster");
    return COMPARE_STATUS.CALENDAR_FASTER;
  }
  
  console.warn("unpredicted state: toggl description=%s, calendar description=%s", toggl_entry.description, calendar_event.getTitle());
  return -1;
}

function createCalendarEvent_fromTogglEntry(calendar, toggl_entry)
{
  var toggl_entry_start = new Date(toggl_entry.start);
  var toggl_entry_stop = new Date(toggl_entry.stop);
  if(toggl_entry_start.getTime() < toggl_entry_stop.getTime())
  {
    calendar.createEvent(toggl_entry.description, toggl_entry_start, toggl_entry_stop);
  }
  else
  {
    console.warn("unexpected toggl stop time:description=%s, start=%s, stop=%s", toggl_entry.description, toggl_entry_start, toggl_entry_stop);
  }
}

function main()
{
  //parameters
  var DURATION = 7*24*60*60*1000;//7 days * 24 hours * 60 mins * 60 seconds * 1000 milliseconds
  
  var now_time = new Date();
  var start_time = new Date(now_time - DURATION);

  //load toggl entries
  var toggl_entries = JSON.parse(getTogglEntries(start_time));
  
  //load calendar events by now
  var calendar = CalendarApp.getCalendarById(GOOGLE_CALENDAR_ID);
  var calendar_events = calendar.getEvents(start_time, now_time);
  
  //check status
  console.log("toggl_entries.length:", toggl_entries.length);
  if(toggl_entries.length > 0)console.log("toggl_entry example:" + JSON.stringify(toggl_entries[0]));
  else{
    console.warn("no entry in toggl");
    return 0;
  }
  console.log("calendar_events.length:", calendar_events.length);
  if(calendar_events.length > 0)console.log("calendar_event example: title=" + calendar_events[0].getTitle()+" start="+calendar_events[0].getStartTime()+" end="+calendar_events[0].getEndTime());
  
  var toggl_counter = 0;
  var calendar_counter = 0;
  while((toggl_counter < toggl_entries.length)&&(calendar_counter < calendar_events.length)){
    switch(compareTogglAndCalendar(toggl_entries[toggl_counter], calendar_events[calendar_counter]))
    {
      case COMPARE_STATUS.MATCH:
        Logger.log("match in toggl:%s and calendar:%s", toggl_counter, calendar_counter);
        toggl_counter++;
        calendar_counter++;
        break;
      case COMPARE_STATUS.TOGGL_FASTER:
        Logger.log("toggl faster in toggl:%s and calendar:%s", toggl_counter, calendar_counter);
        //create calendar event
        createCalendarEvent_fromTogglEntry(calendar, toggl_entries[toggl_counter]);
        toggl_counter++;
        break;
      case COMPARE_STATUS.CALENDAR_FASTER:
        Logger.log("calendar faster in toggl:%s and calendar:%s", toggl_counter, calendar_counter);
        //delete calendar event
        calendar_events[calendar_counter].deleteEvent();
        calendar_counter++;
        break;
      case COMPARE_STATUS.CHANGED_STATUS:
        Logger.log("changed status in toggl:%s and calendar:%s", toggl_counter, calendar_counter);
        //delete calendar event
        calendar_events[calendar_counter].deleteEvent();
        //create calendar event
        createCalendarEvent_fromTogglEntry(calendar, toggl_entries[toggl_counter]);
        toggl_counter++;
        calendar_counter++;
        break;
      default:
        throw new Error("unpredicted case in comparing switch block");
        break;
    }
  }
  while(toggl_counter < toggl_entries.length)
  {
    createCalendarEvent_fromTogglEntry(calendar, toggl_entries[toggl_counter]);
    toggl_counter++;
  }
  while(calendar_counter < calendar_events.length)
  {
    calendar_events[calendar_counter].deleteEvent();
    calendar_counter++;
  }
}