const cloudinary = require('cloudinary').v2;


cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

module.exports=cloudinary;
// console.log(cloudinary.config());

// const uploadImage = async (imagePath) => {
//     const options = {
//         use_filename: true,
//         unique_filename: false,
//         overwrite: true,
//     };

//     try {
//         const result = await cloudinary.uploader.upload(imagePath, options);
//         console.log(result);

//         return result.public_id;
//     } catch (error) {
//         console.log(error);
//     }
// }

// (async () => {
//     const imagePath = 'C:/Users/User/Desktop/SkillShare.me/SkillShare.me.png';
//     const publicId = await uploadImage(imagePath);


// })();

// cloudinary.config({
//     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//     api_key: process.env.CLOUDINARY_API_KEY,
//     api_secret: process.env.CLOUDINARY_API_SECRET // Click 'View API Keys' above to copy your API secret
// });

// const uploadOnCloudinary = async (localFilePath) => {
//     try {
//         if (!localFilePath)
//             return null
//         const response = cloudinary.uploader.upload(localFilePath, {
//             resource_type: "auto"
//         })
//         //file has been uploaded
//         console.log("file is uploaded on cloudinary",
//             (await response).url);

//         return response;
//     } catch (error) {
//         fs.unlinkSync(localFilePath) // remove the locally saved temporary file
//         return null;
//     }
// }

// export{uploadOnCloudinary}