const express = require('express')
const bodyParser = require('body-parser')
const  ObjectId = require('mongodb').ObjectId
require('dotenv').config()
//autherization for twilio account
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
//port 
const PORT = process.env.PORT || 3000
//to be able to reply to users 
const client = require('twilio')(accountSid, authToken);
require('./database/mongoose')
const User = require('./models/User')
const Appointment = require('./models/Appointment')
const Doctor = require('./models/Doctor');
const Major = require('./models/majors');

const app = express()

app.use(bodyParser.urlencoded({
    extended:true
}))

app.use(bodyParser.json())

function sendReply(number,Body){
    return client.messages.create({
        from: 'whatsapp:+14155238886',
        body: Body,
        to: number
    })
}
function compareDates(date1,date2){
    try{
        const same_year = date1.getFullYear()===date2.getFullYear()
        const same_month = date1.getMonth()===date2.getMonth()
        const same_day = date1.getDate()===date2.getDate()
        if(same_year && same_month && same_day){
            return true
        }
        return false
    }catch(e){
       return e.message
    }
}
const getDoctorId = (appointments)=>{
    var aa = ""
    appointments.forEach((appointment)=>{
        if(appointment.Date===null){
            // console.log(appointment.doctor_id)
            aa = appointment.doctor_id
        }
    })
    return aa
}
function isValid(date){
    return date.getTime()===date.getTime()
}
app.get('/',async(req,res)=>{
    res.send('<h1>welcome!</h1>');

})

app.post('/whatsapp',async(req,res)=>{
    //the number of the sender 
    const _number = req.body.From
    try{
        const user =  await User.findOne({number: _number})
        //for aborting
        if(req.body.Body==="abort"){
            if(!user){
                return sendReply(_number,`aborting`)
            }
            const updated_user = await User.findOneAndUpdate({number:_number},{status:0},{new:true, runValidators: true})
            if(!updated_user){
                sendReply(_number,"unexpected error")
            }
            return sendReply(_number,"aborting")

        }
        if(!user){
            const newUser = new User({
                number:_number
            })
            await newUser.save()
            const majors = await Major.find({})
            if(!majors){
                throw new Error("unexpected error, \n kindly send again")
            }
            var major_result = ""
            majors.forEach((result)=>{
                major_result = major_result.concat(`\n ${result.name}`) 
            })
            return sendReply(_number,`hello ,welcome to MicroHealth! \n please choose a major to proceede: ${major_result} ?`)
        }
        //for cheching status :0 means he send the first message 
        if(user.status===0){
            const majors = await Major.find({})
            if(!majors){
                throw new Error("unexpected error, \n kindly send again")
            }
            var major_result = ""
            majors.forEach((result)=>{
                major_result = major_result.concat(`\n ${result.name}`) 
            })
            const updated_user = await User.findOneAndUpdate({number:_number},{status:1},{new:true, runValidators: true})
            if(!updated_user){
                throw new Error("unexpected error, \n kindly send again")
            }
            return sendReply(_number,`hello ,welcome to MicroHealth! \n please select a major from the list below : ${major_result}`)
        }
        //get the list of doctors 
        if(user.status===1){
            const _major = req.body.Body
            const major_id = await Major.findOne({name:_major})
            if(!major_id){
                throw new Error("major is not found ,please choose a major from the list above")
            }
            const doctors = await Doctor.find({}).populate('major')
            if(!doctors){
               throw new Error("unexpected error")
            }
            var doctor_result= ""
            doctors.forEach((result)=>{
                if(result.major.name===_major){
                    doctor_result = doctor_result.concat(`\n ${result.name}`)
                } 
            })
            const updated_user = await User.findOneAndUpdate({number:_number},{status:2},{new:true, runValidators: true})
            if(!updated_user){
                return sendReply(_number,"user not found to update")
            }
            return sendReply(_number,`please select a doctor from the list below: ${doctor_result}`)
        }
        //set the appointment
        if(user.status===2){
            const _doctor = req.body.Body
            const doctor = await Doctor.findOne({name:_doctor})
            if(!doctor){
                throw new Error("doctor name is not found , please choose a doctor from the list above")
            }
            const new_appointment = new Appointment({
                user_id: user._id,
                doctor_id: doctor._id 
            })
            const appointment = await new_appointment.save()
            await user.appointments.push(appointment._id) 
            await user.save()
            const updated_user = await User.findOneAndUpdate({number:_number},{status:3},{new:true, runValidators: true})
            if(!updated_user){
                return sendReply(_number,"user not found to update")
            }
            return sendReply(_number,"please set an appointment")
        }
        //set an appointment date 
        if(user.status===3){
            const date_time = req.body.Body
            const set_date = new Date(date_time)
            if(!isValid(set_date) || !/^([0-9]{4})(-)(1[0-2]|0[1-9])\2(3[01]|0[1-9]|[12][0-9])$/.test(date_time)){
                throw new Error("set a valid date")
            }
            
            const userPopulated = await User.findOne({number:_number}).populate('appointments')
            const the_appointments = userPopulated.appointments 
            const doctor_id = getDoctorId(the_appointments)
            const appointment_for_user = await Appointment.find({Date:{$ne:null}})

            var dates_per_day = 0;
            if(appointment_for_user){
                appointment_for_user.forEach((element)=>{
                    if(compareDates(set_date,element.Date)){
                        if(doctor_id===element.doctor_id){
                            throw new Error("the day you entered is reserved ,please try another one")
                        }
                        dates_per_day++
                    }
                    
                })
            }
            if(dates_per_day>4){
                throw new Error("the maximum number of appointments allowed is 4")
            }
            const update_date = await Appointment.findOneAndUpdate({user_id:user._id,doctor_id: doctor_id},{Date:set_date},{new:true, runValidators: true})
            if(!update_date){
                throw new Error("unexpected error")
            }
            const updated_user = await User.findOneAndUpdate({number:_number},{status:0},{new:true, runValidators: true})
            if(!updated_user){
                return sendReply(_number,"user not found to update")
            }
            return sendReply(_number,"appointment is set ,hope you a nice day \n to take a new appointment please send a message")
        }
    }catch(e){
        return sendReply(_number,e.message)
    }
})

app.listen(PORT,()=>{
    console.log("listening to port"+ PORT)
})