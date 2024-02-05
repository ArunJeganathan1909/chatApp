import React from 'react'
import Avatar from './Avatar'

const Contact = ({id, onClick, selected, username, online}) => {
    return (
        <div
            key={id}
            onClick={() => onClick(id)}
            className={'border-b border-gray-100 flex gap-2 items-center cursor-pointer ' + (selected ? 'bg-blue-100' : '')}
        >
            {selected && (
                <div className='w-1 bg-blue-500 h-12 rounded-r-md'></div>
            )}
            <div className='flex gap-2 py-2 pl-4'>
                <Avatar
                    username={username}
                    userId={id}
                    online={online}
                />
                <span className='text-gray-800'> {username} </span>
            </div>
        </div>
    )
}

export default Contact