const TelegramBot = require('node-telegram-bot-api');
const { types } = require('util');
const { endOfWeek, startOfWeek, setDefaultOptions, previousMonday, nextMonday, parse } = require("date-fns");
const { uk, tr } = require ('date-fns/locale');
setDefaultOptions({ locale: uk });
// replace the value below with the Telegram token you receive from @BotFather
const token = 'YOURBOTTOKEN';

// import { html as format } from "telegram-format";
const {markdownv2: format} = require('telegram-format');

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

var commonFilters = {};

var facultyId = null;
var educForm = null;
var course = null;

var defaultStartDate = null;
var defaultEndDate = null;

bot.setMyCommands([
    {command: '/schedule', description: 'Отримати розклад'},
]);

bot.onText(/\/schedule/, async (msg) => {

    // const scheduleTypes = await getScheduleTypes();
    const userId = msg.from.id;

    await getCommonFilters();
    let facs = populateButtons(commonFilters.d.faculties, 'fcs', null);
    await sendButtonMessage(userId, facs, "Виберіть факультет (якщо ви хочете щоб бот запам'ятав вашу группу, напишіть в чат вашу группу в форматі (КБ-211, 3) (Група, курс)");
});
bot.onText(/\/start/, async (msg) => {
    console.log(msg);
    await bot.sendMessage(msg.from.id, `Напишіть команду ${format.url('/schedule', '/schedule')} для початку`, {parse_mode: 'MarkdownV2'});
});
bot.onText(/[-]|[,]/, async (msg, match) => {
    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message
    console.log(msg);
    const userId = msg.from.id;
    let message = Object.values(match)[2];
    const words = message.split(',');
    let buttonTxt = words[0].trim();
    let courseTxt = words[1].trim();
    const key = await findGroup(buttonTxt, courseTxt);
    if (await key !== null) {
        let event = new Date();


        const datePickerBtns = createDateButtons(await key, {'startDate':  cropDate(startOfWeek(event).toLocaleDateString()), 'endDate': cropDate(endOfWeek(event).toLocaleDateString())});
        sendButtonMessage(userId, datePickerBtns, 'Оберіть період розкладу для '+ buttonTxt);
        rememberLastGroup(userId, `${buttonTxt}, ${courseTxt}`);
    }
    else {
        await bot.sendMessage(userId, `Нажаль${format.escape(',')} такої групи не знайдено${format.escape('.')} Спробуйте ще раз в форматі${format.escape(':')} ${format.bold('КБ'+format.escape('-')+'211'+format.escape(',')+' 3')} ${format.escape('—')} Група${format.escape(',')} курс`, {parse_mode: 'MarkdownV2'})
    }
    // send back the matched "whatever" to the chat
    // bot.sendMessage(chatId, resp);
});

bot.on("callback_query", async (query) => {
    const { data } = query; // Extract the callback data
    const jsData = JSON.parse(data);
    const userId = query.from.id;
    console.log(userId);
    if (Object.keys(commonFilters).length === 0) await getCommonFilters();
    switch (jsData.t) {
        case ('fcs') :
            facultyId = jsData.key;
            let bArr = populateButtons(commonFilters.d.educForms, 'edF', null);
            sendButtonMessage(userId, bArr, 'Виберіть форму навчання');
            await bot.answerCallbackQuery(query.id);
            break;
        case ('edF') :
            educForm = jsData.key;
            let eArr = populateButtons(commonFilters.d.courses, 'css', null);
            sendButtonMessage(userId, eArr, 'Виберіть курс');
            await bot.answerCallbackQuery(query.id);
            break;
        case ('css') :
            course = jsData.key;
            cDigit = jsData.c;
            if (facultyId && educForm && course === null) await bot.sendMessage(userId, 'Не вистачає даних');
            const groups = await getStudyGroups(facultyId, educForm, course);
            let gArr = populateButtons(await groups.d.studyGroups, 'grp', cDigit);
            sendButtonMessage(userId, gArr, 'Виберіть группу');
            await bot.answerCallbackQuery(query.id);
            break;
        case ('grp') :
            let id = jsData.key;
            let event = new Date();
            let buttonTxt = jsData.bt;
            let courseD = jsData.c;
            let group = buttonTxt+', '+courseD;
            const datePickerBtns = createDateButtons(id, {'startDate':  cropDate(startOfWeek(event).toLocaleDateString()), 'endDate': cropDate(endOfWeek(event).toLocaleDateString())});

            sendButtonMessage(userId, datePickerBtns, 'Оберіть період розкладу для ' + group);
            // rememberLastGroup(userId, group);
            await bot.answerCallbackQuery(query.id);
            break;

        case ('bck') :

            let start = jsData.st;
            let end = jsData.en;
            let createData = start.replace('.', '/') + '/' + new Date().getFullYear();

            var result = parse(createData, 'dd/MM/yyyy', new Date());
            
            let buttonsArr = createDateButtons(jsData.k, {'startDate':  cropDate(startOfWeek(previousMonday(result)).toLocaleDateString()), 'endDate': cropDate(endOfWeek(previousMonday(result)).toLocaleDateString())});

            await bot.editMessageReplyMarkup({inline_keyboard: buttonsArr}, {chat_id: userId, message_id: query.message.message_id});
            await bot.answerCallbackQuery(query.id);
            break;

        case ('nxt') :

            let startN = jsData.st;
            let endN = jsData.en;
            let createDataN = startN.replace('.', '/') + '/' + new Date().getFullYear();

            var result = parse(createDataN, 'dd/MM/yyyy', new Date());
            
            let buttonsArrN = createDateButtons(jsData.k, {'startDate':  cropDate(startOfWeek(nextMonday(result)).toLocaleDateString()), 'endDate': cropDate(endOfWeek(nextMonday(result)).toLocaleDateString())});

            await bot.editMessageReplyMarkup({inline_keyboard: buttonsArrN}, {chat_id: userId, message_id: query.message.message_id});
            await bot.answerCallbackQuery(query.id);
            break;
        
        case ('cnf') :
            let startOfSchedule = jsData.st;
            let endOfSchedule = jsData.ed;
            let groupKey = jsData.k;
            let parseData = startOfSchedule.replace('.', '/') + '/' + new Date().getFullYear();
            let schedule = await getRangeSchedule(groupKey, `${startOfSchedule}.${new Date().getFullYear()}`, `${endOfSchedule}.${new Date().getFullYear()}`);
            await sendScheduleMessage(await schedule, userId, );

            await bot.answerCallbackQuery(query.id);
            break;


        case ('cur') :
            await bot.answerCallbackQuery(query.id);
            break;
    }
    // Check if the callback data matches the expected value
    // if (data === "Data") {
    //   // Send a reply message
    //   await bot.telegram.sendMessage(chatId, "Thank you for clicking the button!");
    // }
});
async function findGroup(groupName, courseDigit) {
    const groups = await getStudyGroups(null, null, courseDigit);
    try {
        Object.keys(groups.d.studyGroups);
    } catch (error) {
        return null;
    }
    const data = await groups.d.studyGroups;
    let groupKey = null;
    for (let i in  data) {
        if ( data[i].Value === groupName.toString() ) {
            groupKey = data[i].Key;
            return groupKey;
        }
    }
    return null;
}
async function sendScheduleMessage(schedule, userId, group) {
    let data = await schedule.d

    if (Object.keys(data).length < 1) {
        await bot.sendMessage(userId, 'Нема розкладу :)');
        return;
    }
    let scheduleText = '';

    for (let i in data) {
        let formattedText;
        if (data[i].cabinet !== null) {
            formattedText = `${format.escape('['+data[i].study_time+']')} ${format.bold(format.escape(data[i].study_time_begin)) + format.escape('-') + format.bold(format.escape(data[i].study_time_end))} ${format.italic(format.escape(data[i].discipline)) + ' : ' + format.underline(format.escape(data[i].study_type))} ${format.escape('('+data[i].cabinet+')')} \n`;
        } else {
            formattedText = `${format.escape('['+data[i].study_time+']')} ${format.bold(format.escape(data[i].study_time_begin)) + format.escape('-') + format.bold(format.escape(data[i].study_time_end))} ${format.italic(format.escape(data[i].discipline)) + ' : ' + format.underline(format.escape(data[i].study_type))} ${format.escape('('+"Онлайн"+')')} \n`;
        }
        
        if (Number(i) > 0) {
            //if NOT same as previous
            if (data[i].week_day !== data[i-1].week_day) {
                //write week day
                scheduleText += format.bold(data[i].week_day) + '\n';
            }
            scheduleText +=formattedText;
        }
        
        //First run
        else {
            scheduleText += format.bold(data[i].week_day) + '\n';
            scheduleText += formattedText;
        }

    }
    let rememberGroup = {reply_markup: {keyboard: [[{'text': group}]], resize_keyboard: true, is_persistent: true}};
    await bot.sendMessage(userId, scheduleText, {parse_mode: 'MarkdownV2', rememberGroup});
}

async function getData(url){
    const response = await fetch(url);
    return await response.json();
}

async function getCommonFilters() {
    commonFilters = await getData('https://vnz.osvita.net/WidgetSchedule.asmx/GetStudentScheduleFiltersData?aVuzID=11761');
    return commonFilters;
}
   

async function sendButtonMessage(userId, buttonsArr, textMessage) {
    await bot.sendMessage(userId, textMessage, {
        reply_markup: {
        inline_keyboard: buttonsArr,
    }
});

}
async function rememberLastGroup(userId, data) {
    let messageToDelete = await bot.sendMessage(userId, 'Розклад:', {reply_markup: {keyboard: [[{'text': data}]], resize_keyboard: true, is_persistent: true}});

}

function populateButtons(data, type, optionalData) {
    let arr = [];
    let newArr = [];
    for (let i in data) {
        if (Number(i) % 3 === 0) {
            if (newArr.length !== 0) arr.push(newArr);

            newArr = [];
        }
        let callbackData;
        if (type === 'css') {
            let text = (data[i].Value).split(' ');
            callbackData = JSON.stringify({'key': data[i].Key, 't': type, 'c': text[0]});
        }
        else if (type === 'grp') {
            callbackData = JSON.stringify({'key': data[i].Key, 't': type, 'bt': data[i].Value, 'c': optionalData});
        } 
        else {
            callbackData = JSON.stringify({'key': data[i].Key, 't': type});
        }

        newArr.push({"text": data[i].Value, "callback_data": callbackData});

        if (Number(i) === (data.length-1)) {
            arr.push(newArr)
        }
    }
    return arr;
}

// function createMoveContentForButtons(date, type) {
//     JSON.stringify({'st': date.startDate, 'ed': date.endDate, 't': type});
// }

function populateDate(key, date){
    backButton =    {'text': '◀', "callback_data": JSON.stringify({'k': key, 'st': date.startDate, 'ed': date.endDate, 't': 'bck'})};
    confirmButton = {'text': '✅', "callback_data": JSON.stringify({'k': key, 'st': date.startDate, 'ed': date.endDate, 't': 'cnf'})};
    currentButton = {'text': `${date.startDate} - ${date.endDate}`, 'callback_data': JSON.stringify({'k': key, 'st': date.startDate, 'ed': date.endDate, 't': 'cur'})};
    nextButton =    {'text': '▶', 'callback_data': JSON.stringify({'k': key, 'st': date.startDate, 'ed': date.endDate, 't': 'nxt'})};
    let arr = [[backButton, currentButton, nextButton], [confirmButton]];
    return arr;
}

function createDateButtons(key, data) {
    
    const event = new Date();
    let todayAndMonth = event.toLocaleDateString();

    let lastDayOfWeek = endOfWeek(event, { weekStartsOn: 1 });
    let firstDayOfWeek = startOfWeek(event, { weekStartsOn: 1 });

    defaultStartDate = cropDate(todayAndMonth);
    defaultEndDate = cropDate(lastDayOfWeek.toLocaleDateString());
    let backButton;
    let confirmButton;
    let currentButton;
    let nextButton;
    buttons = populateDate(key, data);
    // if (defaultStartDate === cropDate(todayAndMonth)) {
    //     // backButton = {'text': '◀', "callback_data": createMoveContentForButtons(key, 'bck')};
    //     // confirmButton = {'text': '✅', "callback_data": JSON.stringify({'k': key, 'st': defaultStartDate, 'ed': defaultEndDate, 't': 'cnf'})};
    //     // currentButton = {'text': `${defaultStartDate} - ${defaultEndDate}`, 'callback_data': 'current'};
    //     // nextButton = {'text': '▶', 'callback_data': createMoveContentForButtons(key, start, end, 'nxt')};
    //     buttons = populateDate(key, {'startDate': defaultStartDate, 'endDate': defaultEndDate});
    // } else {
    //     buttons = populateDate(key, data);
    // }
    // let backButton = {'text': '◀', "callback_data": createMoveContentForButtons(key, start, end, 'bck')};
    // nextButton = {'text': '▶', 'callback_data': createMoveContentForButtons(key, start, end, 'nxt')};

    


    // let totalDays = daysInMonth(event.getMonth(), event.getFullYear());
    // let today = event.getDay();


    // let buttons = [[backButton, currentButton, nextButton], [confirmButton]];

    return buttons;
}

function cropDate(date) {
    return date.substring(0, date.lastIndexOf('.'));
}

function daysInMonth (month, year) {
    return new Date(parseInt(year), parseInt(month) + 1, 0).getDate();
  }
async function getStudyGroups(facultyId, educForm, course) {
   if (facultyId && educForm && course === null) return;

   if (facultyId !== null) facultyId = `%22${facultyId}%22`;
   if (educForm !== null) educForm = `%22${educForm}%22`;
   if (course !== null) course = `%22${course}%22`;
    const url = `https://vnz.osvita.net/WidgetSchedule.asmx/GetStudyGroups?aVuzID=11761&aFacultyID=${facultyId}&aEducationForm=${educForm}&aCourse=${course}&aGiveStudyTimes=false`;
    const data = await getData(url);
    return await data;
    
}

async function getRangeSchedule(key, start, end) {
    let url = `https://vnz.osvita.net/WidgetSchedule.asmx/GetScheduleDataX?aVuzID=11761&aStudyGroupID=%22${key}%22&aStartDate=%22${start}%22&aEndDate=%22${end}%22&aStudyTypeID=null`;

    const data = await getData(url);

    return await data;
}
