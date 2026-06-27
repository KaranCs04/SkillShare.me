const socket=io('http://localhost:3000');

const token=localStorage.getItem('token');

if(token){
    const payload=JSON.parse(atob(token.split('.')[1]));
    const userId=payload.userId;

    socket.emit('register',userId);
}

socket.on('new-notifications',(data)=>{
    alert(`New message from ${data.senderName}:${data.content}`);
})