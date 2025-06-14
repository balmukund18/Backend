import { asyncHandler } from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import {uploadOnCloudinary} from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import jwt from 'jsonwebtoken';

const generateAccessAndRefereshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating referesh and access token")
    }
}

const registerUser = asyncHandler(async (req, res) => {



    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    try {
        // get user details from frontend
        const { fullName, email, username, password } = req.body
        
        console.log("Request body received:", {
            fullName,
            email,
            username,
            hasPassword: !!password
        });

        // validation - not empty
        if (!fullName || !email || !username || !password) {
            throw new ApiError(400, "All fields are required")
        }

        if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
            throw new ApiError(400, "All fields must be non-empty strings")
        }

        // check if user already exists
        const existedUser = await User.findOne({
            $or: [{ username }, { email }]
        })

        if (existedUser) {
            throw new ApiError(409, "User with email or username already exists")
        }

        // check for avatar file
        const avatarLocalPath = req.files?.avatar?.[0]?.path;
        let coverImageLocalPath = undefined;

        if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
            coverImageLocalPath = req.files.coverImage[0].path
        }

        if (!avatarLocalPath) {
            throw new ApiError(400, "Avatar file is required")
        }

        // upload to cloudinary
        const avatar = await uploadOnCloudinary(avatarLocalPath)
        const coverImage = coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath) : null

        if (!avatar) {
            throw new ApiError(400, "Error while uploading avatar")
        }

        // create user object with trimmed values
        const user = await User.create({
            fullName: fullName.trim(),
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email: email.trim(),
            password,
            username: username.toLowerCase().trim()
        })

        // get user without sensitive fields
        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken"
        )

        if (!createdUser) {
            throw new ApiError(500, "Something went wrong while registering the user")
        }

        // return response
        return res.status(201).json(
            new ApiResponse(201, createdUser, "User registered Successfully")
        )

    } catch (error) {
        console.error("Registration error:", error);
        throw error;
    }
})

const loginUser = asyncHandler(async (req, res) => {
    try {
        // 1. Get data from request body
        const { email, username, password } = req.body;
        
        // Debug log
        console.log("Login attempt with:", { 
            email: email || "not provided", 
            username: username || "not provided" 
        });

        // 2. Validation
        if (!password) {
            throw new ApiError(400, "Password is required")
        }

        if (!email && !username) {
            throw new ApiError(400, "Either email or username is required")
        }

        // 3. Find user with either email or username
        const user = await User.findOne({
            $or: [
                { email: email?.toLowerCase()?.trim() },
                { username: username?.toLowerCase()?.trim() }
            ]
        }).select("+password"); // Explicitly select password field

        console.log("User found:", user ? "Yes" : "No");

        if (!user) {
            throw new ApiError(404, "User does not exist with provided credentials")
        }

        // 4. Password check
        const isPasswordValid = await user.isPasswordCorrect(password);
        
        if (!isPasswordValid) {
            throw new ApiError(401, "Invalid credentials")
        }

        // 5. Generate tokens
        const {accessToken, refreshToken} = await generateAccessAndRefereshTokens(user._id);
        
        // 6. Get user without sensitive fields
        const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

        // 7. Set cookies
        const options = {
            httpOnly: true,
            secure: true
        }

        // 8. Send response
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser,
                        accessToken,
                        refreshToken
                    },
                    "User logged in successfully"
                )
            )

    } catch (error) {
        console.error("Login error:", error);
        throw error;
    }
})
const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
            
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})

export {registerUser,
loginUser,
logoutUser,
refreshAccessToken
};
